# Gapped

**Racing apps exist. Running has never had a rank mode.**

Gapped is competitive matchmaking for real-world running. You join on your
phone, find runners near you at your level, and duel them head to head. During
a duel each phone shows one number the size of your palm: the gap in metres
between you and your opponent, green when you lead and garnet when you trail.
Win and your rating climbs. That is the whole game.

## What it does

- **Join with a name and a phone number.** A texted six-digit code proves the
  number, and the number is the credential — no password, and progress follows
  you to any device. Accounts from before sign-in existed keep working on
  their stored player id, and can verify a number later from the profile
  screen.
- **Find someone worth racing.** The lobby ranks every runner by a blend of how
  near they are and how close their rating is, with toggles for pure distance
  or pure rating gap. Runners without location are shown at the bottom rather
  than hidden.
- **Duel head to head, two ways.** A race is first to the distance; a timed
  duel is most metres before the clock runs out. Both phones count down
  together, and the live screen shows the gap between you updating as you run.
  Timed duels settle themselves on the server when time expires, so a result
  arrives even if a phone wanders off.
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
  lib/             elo, geo, ids, phone, sms, validation, serializers
  routes/          auth (phone codes), join, players, leaderboard
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
| `AUTH_CODE_TTL_SECONDS` | `300` | How long a texted sign-in code stays valid. |
| `AUTH_CODE_ECHO` | on outside production | Return the code in the request-code response. Forcing it on in production means anyone can sign in as any number. |

### Deploying

`railway.json` carries the build command, start command and a `/api/health`
check. Add a volume, mount it at `/data`, and set `DATABASE_PATH=/data/gap.db` —
without it the database lives in the container and every redeploy wipes every
rating and duel.

Geolocation and the screen wake lock both require a secure context, so the app
only fully works over HTTPS. `localhost` counts; a bare IP address does not.

## Known limits

- **No SMS provider is wired.** `server/lib/sms.js` is the seam for one.
  Until it is filled in, dev builds echo the code in the request-code
  response, and production only logs it — so production sign-in means
  reading codes out of the deploy logs. Codes are rate limited (30 s
  cooldown, five per number per hour, five guesses each) but request-code
  has no per-IP limit, so a public deploy with a real provider would want a
  proxy in front of it.
- **Legacy accounts are weakly held.** An account created before sign-in
  existed authenticates by its bare player id until a number is verified on
  it, so anyone holding that id is that player.
- **GPS is filtered, not solved.** The tracker rejects fixes worse than 25 m
  accuracy and any implying over 11 m/s, and holds sub-3 m steps as jitter so
  standing still no longer drip-feeds distance — but urban-canyon drift can
  still flatter a slow runner.
- Separate-course duels and Strava seeding are specified but not built.
