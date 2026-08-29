# Gap

A competitive platform for real-world running. Players join by phone, find each
other by location and by skill rating, and challenge each other head-to-head in
a live battle. ELO ratings, ranked tiers, and a leaderboard.

Full mobile web is the target.

## Stack

A single-node service:

- **Fastify** for HTTP, with the **`ws`** library for WebSockets on the same server.
- **SQLite** (`better-sqlite3`) for storage.
- **Vite + React + Tailwind** frontend, built to static files and served by that
  same Fastify process — **same origin, so there is no CORS to configure**.
- **Plain JavaScript.** No TypeScript, no test suite.

```
server/            Fastify service
  config.js        every tunable, read from the environment
  index.js         HTTP + static + WebSocket upgrade
  db/              schema and data access (better-sqlite3)
  lib/             elo, geo, ids, validation, serializers
  routes/          REST endpoints
  ws/              the live battle hub
client/            Vite + React + Tailwind frontend
  src/pages/       Login, Radar, Battle, Leaderboard, Profile
  src/state/       session context, wraps the socket
  src/lib/         api client, socket, GPS tracker
```

## Running it

```bash
npm install
npm run build     # builds the frontend into client/dist
npm start         # serves API + frontend on one port
```

For frontend work, run the API and the Vite dev server side by side — Vite
proxies `/api` and `/ws` through to Fastify:

```bash
npm run dev        # Fastify on :3000, restarts on change
npm run dev:client # Vite on :5173
```

There is no SMS provider wired up yet. Outside production the verification code
comes back in the `/api/auth/request-code` response and the login screen shows
it, so the flow is usable end to end.

## Configuration

Copy `.env.example`. The two that matter for deployment:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | Railway injects this; we fall back to 3000 locally. |
| `DATABASE_PATH` | `./data/gap.db` | The SQLite file. Point it at a mounted volume in production. |
| `HOST` | `0.0.0.0` | |
| `NODE_ENV` | `development` | Set to `production` to stop returning the dev login code. |
| `DISCOVERY_RADIUS_M` | `5000` | How far away an opponent can be. |
| `DISCOVERY_RATING_SPREAD` | `250` | How far apart two ratings can be and still match. |
| `PRESENCE_TTL_MS` | `90000` | How long since last contact still counts as online. |

### Deploying to Railway

`railway.json` sets the build and start commands. Add a volume, mount it at
`/data`, and set `DATABASE_PATH=/data/gap.db` — otherwise the database lives in
the container filesystem and disappears on every redeploy.

## How a race works

1. Both runners share location. Discovery returns opponents inside
   `DISCOVERY_RADIUS_M` and within `DISCOVERY_RATING_SPREAD` rating, sorted by
   how evenly matched they are.
2. One sends a challenge over the socket, naming a distance. It expires after 60
   seconds if unanswered.
3. On accept, the server creates the match and sends both phones a shared
   `startsAt`, five seconds out, so neither starts early.
4. Each phone tracks its own GPS and reports progress about once a second. The
   server clamps progress so it only ever moves forward, and relays it to the
   opponent — that relayed number is the gap.
5. First to the distance wins. Ratings settle in a single transaction, so a
   match can never be scored twice.

Drop out mid-race and you have 45 seconds to reconnect before the win goes to
your opponent.

### Ratings

Standard ELO from 1200, with a higher K for a player's first ten races so new
runners reach their real rating quickly. Tiers: Bronze, Silver (1100), Gold
(1300), Platinum (1500), Diamond (1700), Apex (1900).

### GPS honesty

The tracker discards fixes worse than 35 m accuracy, ignores movements under
3 m (drift while standing still), and drops samples implying more than 12 m/s.
This is the obvious first line of defence, not a finished anti-cheat story.

## What is not built yet

- An SMS provider. Logins are dev-code only.
- Rematch, race history against a specific rival, friends.
- Anything stronger than the GPS sanity checks above.
- Tiers are cosmetic — no placement races or seasonal resets.
