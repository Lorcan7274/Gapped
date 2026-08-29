# Gapped

**Racing apps exist. Running has never had a rank mode.**

Gapped is competitive matchmaking for real-world running. You join on your
phone, find runners near you at your level, and duel them head to head. During
a duel each phone shows one number the size of your palm: the gap in metres
between you and your opponent, green when you lead and garnet when you trail.
Win and your rating climbs. That is the whole game.

## Team

| Name | Role |
| --- | --- |
| _(fill in)_ | _(fill in)_ |

## What it does

- **Join in one tap.** A display name, nothing else. No password, no email, no
  verification code. The player record lives in `localStorage`, so a reload
  drops you straight back on the home screen.
- **Find someone worth racing.** The lobby ranks every runner by a blend of how
  near they are and how close their rating is, with toggles for pure distance
  or pure rating gap. Runners without location are shown at the bottom rather
  than hidden.
- **Duel head to head.** Challenge someone, both phones count down together,
  and the live screen shows the gap between you updating as you run.
- **Climb the ladder.** ELO ratings from 1000, Sapphire I through V, and a
  ladder that marks your own row and your nemesis — the runner closest to you
  on rating.
- **Trust the distance.** GPS is the risky part, so it has its own unlinked
  test bench at `/debug`: start, walk a measured 100 m, and confirm the counter
  lands inside 10%.

## Design

The visual direction is **Shard Mono** — a Swiss-minimal editorial base that
earns its gamification. Warm off-white paper, near-black ink, hairline rules
and generous white space. No cards, no grey fills, no shadows; structure comes
from 1px lines alone. Archivo throughout, 900-weight numerals with tight
negative tracking, and 11–13px uppercase labels at 0.22em.

Exactly one accent — indigo `#4F46E5` — plus garnet `#A43F5E`, reserved for the
nemesis and for trailing in a duel. Nothing else in the app carries colour.

The one non-typographic element is the crystal: a faceted sapphire built in
pure CSS from stacked clip-path polygons, with white and navy facet overlays
faking cut faces, two bright slivers down the spine, and a bar of light
sweeping across on a slow gleam. It drifts vertically over 5.5 seconds with a
hairline ellipse beneath that squeezes in sync. It scales from 78px on the home
screen down to 13px for a ladder row.

Every touch target is at least 56px.

## Stack

A single Node process serves everything from one origin, so there is no CORS to
configure and nothing to deploy separately.

- **Fastify** for HTTP, with the **`ws`** library for WebSockets on the same server
- **SQLite** via `better-sqlite3`
- **Vite + React + Tailwind v4**, built to static files and served by that same
  Fastify process
- **Plain JavaScript.** No TypeScript, no test suite

```
server/
  config.js        every tunable, read from the environment
  index.js         HTTP, static files, and the WebSocket upgrade
  db/              schema, migrations, data access
  lib/             elo, geo, ids, validation, serializers
  routes/          join, players, leaderboard
  ws/hub.js        presence, player-list broadcast, duels
client/src/
  pages/           Join, Home, Challenge, Battle, Leaderboard, Profile, Debug
  components/      Crystal, ui primitives, challenge and result sheets
  lib/             api, socket, GPS tracker, ranking
  state/           session context
```

## Running it

```bash
npm install
npm run build     # builds the client into client/dist
npm start         # serves API and frontend on one port
```

Then open `http://localhost:3000`.

For frontend work, run both and let Vite proxy `/api` and `/ws` through:

```bash
npm run dev        # Fastify on :3000, restarts on change
npm run dev:client # Vite on :5173
```

### Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | Railway injects this; we fall back to 3000 locally. |
| `DATABASE_PATH` | `./data/gap.db` | Point at a mounted volume in production. |
| `HOST` | `0.0.0.0` | |
| `DISCOVERY_RADIUS_M` | `5000` | How far away an opponent can be. |
| `DISCOVERY_RATING_SPREAD` | `250` | How far apart two ratings can be and still match. |

### Deploying

`railway.json` carries the build command, start command and a `/api/health`
check. Add a volume, mount it at `/data`, and set `DATABASE_PATH=/data/gap.db` —
without it the database lives in the container and every redeploy wipes every
rating and duel.

Geolocation and the screen wake lock both require a secure context, so the app
only fully works over HTTPS. `localhost` counts; a bare IP address does not.

## Known limits

- **No real authentication.** The player id in `localStorage` is the only
  credential, so anyone holding one is that player. Fine for a private demo,
  not for public release.
- **GPS drift is not filtered.** The tracker rejects fixes worse than 25 m
  accuracy and any implying over 11 m/s, but has no minimum-step floor, so
  standing still slowly accumulates distance.
- Duel modes beyond the distance duel, separate-course duels, and Strava
  seeding are specified but not built.
