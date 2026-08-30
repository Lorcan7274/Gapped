# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Gapped: competitive matchmaking for real-world running. Players verify a phone number, find nearby runners at their rating, and duel head to head; during a duel each phone shows the live gap in metres to the opponent. Plain JavaScript throughout — no TypeScript, no test suite, no linter.

The app is called Gapped everywhere — package names, log lines, localStorage keys, the database filename. Never shorten it to "gap"; that bare word is reserved for the distance between two runners.

## Commands

Node 22 is pinned (`.nvmrc` / `.node-version`) so `better-sqlite3` installs from a prebuilt binary.

```bash
npm install
npm run build      # installs client deps and builds client/ into client/dist
npm start          # one Fastify process serves API + built frontend on :3000
npm run dev        # server only, restarts on change (node --watch)
npm run dev:client # Vite on :5173, proxies /api and /ws to :3000 — run alongside npm run dev
```

There are no tests; verification means exercising the running app (or the API directly). The server runs without a client build — it warns and serves the API only. Geolocation and the wake lock need a secure context: `localhost` works, a bare LAN IP does not.

## Architecture

One Node process, one origin: Fastify serves the JSON API, the static Vite build, and takes the raw HTTP upgrade for the `/ws` WebSocket itself (`server/index.js` → `hub.handleUpgrade`). There is no CORS anywhere, and nothing deploys separately.

### Server (`server/`)

- `config.js` — every tunable, read from the environment. Add new knobs here, not inline.
- `db/` — SQLite via better-sqlite3, WAL mode. `schema.sql` is applied at import, then imperative migrations in `db/index.js` rebuild legacy tables. Migration runs at module import time, before any other module prepares a statement — statement prep against an old schema would throw. Other `db/*.js` files are prepared-statement data access (players, matches, sessions, authCodes).
- `routes/` — auth (phone codes, sessions), join, players/leaderboard. Routes get a `broadcastPlayers` callback so an HTTP change (join, rename, location) pushes the fresh player list out over the sockets.
- `ws/hub.js` — the heart of the app: presence (playerId → Set of sockets), the per-viewer player-list broadcast (distances are computed relative to each reader), challenges with TTL and a sweeper, and the duel state machine. `ws/protocol.js` defines every frame type; frames are JSON `{ type, ts, ...payload }` and a client `id` is echoed back for correlation.
- `lib/` — elo, geo (haversine), ids, phone normalisation, sms, validation, serializers. `serialize.js` decides what the wire sees: `publicPlayer` vs `selfPlayer` — never hand raw DB rows to a socket or route reply.

### Auth model (two tiers — preserve both)

A session token from phone sign-in (`Authorization: Bearer`, or `?token=` on the WS URL) is the credential. A bare player id (`x-player-id` header / `?playerId=`) is still accepted, but **only for accounts with no verified phone number** — legacy accounts from before sign-in existed. The moment a number is attached, the bare id stops working. A dead credential gets HTTP 404 with `code: 'unknown_player'` (not 401), and WS close code 1008 — both deliberately distinguishable from "server down" so the client knows to clear localStorage and show Join instead of retrying forever.

`server/lib/sms.js` texts codes through textbee (textbee.dev — an Android phone paired with the account sends over its own SIM) when `TEXTBEE_API_KEY` is set (`TEXTBEE_DEVICE_ID` optionally picks the sending phone); unset, it only logs the code. Outside production (or with `AUTH_CODE_ECHO=1`) the verification code is also echoed in the request-code response, which is how sign-in works in development without credentials. Texts arrive late and out of order (the gateway phone replays its queue when it wakes), so `checkCode` accepts any live code for the number — unexpired and unconsumed, not just the newest — a miss counts against every live code, and a completed sign-in consumes them all.

### Duels

Two modes throughout challenge → match → result: `'race'` (first to a distance, `distance_m`) and `'timed'` (most metres before the clock, `duration_ms`). Any mode-sensitive code must handle both. Server-side rules the client must not be trusted with: progress is monotonic and capped (finish line for races, max-plausible-speed for timed), timed duels settle themselves via a server deadline timer (plus a grace for the final progress frame), a disconnected runner gets a 45 s forfeit grace, and `reconcileOnBoot` abandons matches left `live` by a dead process without settling ratings.

### Client (`client/src/`)

React 19 + Vite + Tailwind v4. No router: `App.jsx` switches four tabs from local state, and a live match takes over the whole screen. All shared state lives in `state/session.jsx` — the `SessionProvider` owns the socket, handles every server frame, and exposes actions via `useSession()`; pages and components never touch the socket directly. Player + token persist in localStorage. The server's `ready` frame is the reconciliation point: it restores the battle screen after a reload (with `resumeProgressM`, since the GPS trail restarts at zero) or fetches a missed result from match history.

`lib/tracker.js` is the GPS filter (rejects fixes worse than 25 m accuracy or implying > 11 m/s, holds sub-3 m steps as jitter). It has its own unlinked test bench at `/debug`.

### Design system ("Shard Mono")

Swiss-minimal editorial: warm off-white paper, near-black ink, structure from 1px hairlines only — no cards, no grey fills, no shadows. Archivo, 900-weight numerals, uppercase 11–13px labels. Exactly two colours: indigo `#4F46E5` (the accent) and garnet `#A43F5E` (reserved for the nemesis and for trailing in a duel). Touch targets ≥ 56px. Units are metric everywhere. Match this before adding any new UI.

## Deployment

Railway, configured by `railway.json` (build, start, `/api/health` check). `DATABASE_PATH` must point at a mounted volume in production or every redeploy wipes the database. `/api/health` reports the built commit from Railway's env vars — the only way to tell from outside whether a push actually deployed.
