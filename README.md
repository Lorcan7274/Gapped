# Gap

A competitive platform for real-world running. Players join on their phone with
a display name, find each other by location and by skill rating, and challenge
each other head-to-head in a live battle. ELO ratings, ranked tiers, and a
leaderboard.

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
  routes/          REST endpoints (join, players, leaderboard)
  ws/              the live battle hub
client/            Vite + React + Tailwind frontend
  src/pages/       Join, Home, Radar, Battle, Leaderboard, Profile
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

## Joining

There are no passwords and no verification step. `POST /api/join` with a display
name creates a player at a rating of 1000 and returns the record; the client
keeps it in `localStorage`, so a reload goes straight to the home screen. The
player id in that record is the credential for every later call, sent as the
`x-player-id` header.

Location is always optional. The browser is asked at join and again each time
the home screen mounts, but a refusal still joins — coordinates are simply left
null and that player does not appear on anyone's radar.

## Configuration

Copy `.env.example`. The two that matter for deployment:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | Railway injects this; we fall back to 3000 locally. |
| `DATABASE_PATH` | `./data/gap.db` | The SQLite file. Point it at a mounted volume in production. |
| `HOST` | `0.0.0.0` | |
| `NODE_ENV` | `production` on Railway | Only affects log verbosity now. |
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

Standard ELO from 1000, with a higher K for a player's first ten races so new
runners reach their real rating quickly. Tiers: Bronze, Silver (900), Gold
(1100), Platinum (1300), Diamond (1500), Apex (1700).

### GPS honesty

The tracker discards fixes worse than 35 m accuracy, ignores movements under
3 m (drift while standing still), and drops samples implying more than 12 m/s.
This is the obvious first line of defence, not a finished anti-cheat story.

## What is not built yet

- Any real authentication. The player id from `localStorage` is the only
  credential, so anyone holding it is that player. Fine for a private test,
  not for public release.
- Rematch, race history against a specific rival, friends.
- Anything stronger than the GPS sanity checks above.
- Tiers are cosmetic — no placement races or seasonal resets.
