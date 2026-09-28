# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Gapped is an **asynchronous ranked running game** built around ghost duels and weekly pools. It began as a hackathon build of live, simultaneous duels between nearby strangers; that design is dead (it needed two similarly rated strangers running at the same instant) and is being taken apart — see *Rework status* before touching anything. The README is stale.

The whole game, as a player sees it:

1. Every run is **Solo** or **Duel**.
2. **Solo always pays and can never hurt you.**
3. **Points** climb your weekly pool table; Sunday promotes and relegates.
4. **Shards** grow your crystal — duration × intensity relative to your own pace, so a hard 5k and a long slow run both pay honestly.
5. **Fuel**: run to earn it, spend it to start fights (challenges, wagers, bounty sweetening).
6. The pool leader wears the **bounty**.

Anything a player must be taught beyond these six lines should be questioned. The **hidden rating** (MMR) exists but is never shown to players — it is matchmaking machinery for pools, expected-gap lines and house-ghost pacing.

The app is called Gapped everywhere — package names, log lines, localStorage keys, the database filename. Never shorten it to "gap"; that bare word is reserved for the distance between two runners.

## Rework status

The rework runs in phases, each leaving the app runnable, each in small commits:

| Phase | What | State |
| --- | --- | --- |
| 0 | Migrations, auth seam, production guard | **done** |
| 1 | Hidden rating engine + simulation harness | **done** |
| 2 | Run modes, run recording/storage, Shards + Fuel + streak; most of the kill list | **done** |
| 3 | Ghost replay in the tracker; duel flow (challenge → reply → Sunday settlement) | **done** |
| 4 | Pools, feed, points, weekly promote/relegate job, bounty | next |
| 5 | Friends, live friend duels (refactor of `ws/hub.js`), wagers | |
| 6 | Placement import, house ghosts, anti-cheat | |

**Still running but dormant — do not extend:** the live duel socket (`ws/hub.js`, `db/liveDuels.js`, client `Battle.jsx`/`ChallengeSheet.jsx`/`ResultSheet.jsx`) still lets any signed-in player challenge another by id. It moves no points and no rating, and nothing in the UI starts one (the sheets only answer an incoming challenge or rematch); phase 5 puts it behind the friends gate. `DuelSetup.jsx` is likewise unused until then. `components/DuelSheet.jsx` + `lib/duelRig.js` are unused: phase 3 went with a plain Duel button beside Start run (solo stays one tap); the sheet can still become the picker if the design wants it. Everything else on the kill list is deleted: discovery, presence, the queue, geography, calls, Elo, the old `matches`/`challenges` tables and the `players.rating/wins/losses/lat/lng` columns (migration 004 seeded the hidden rating and tier from the old rating).

**Duel flow decided in phase 3** (not spelled out by the spec): the reply settles a duel the moment it is in — nothing later can change it — and Sunday night settles only what is left: an unanswered challenge is a walkover, a leg started but never uploaded is a quit. A leg already running at midnight is not cut off: its run counts if it started before midnight and lands within `DUEL.legGraceMs` (a reply then settles as usual; a first leg then voids the duel with the Fuel back, as no week is left to reply in) — so the week's duel points are only final once that grace has passed. A duel's points land in the week it was started, so a challenge sent late on Sunday gives little time to reply. A run is raced once per challenger, and only within the feed's `DUEL.feedDays` — the endpoint enforces what the feed shows. Starting a leg commits you: starting another race walks away from it (a quit). A leg run pays Shards, Fuel and streak like any run but no solo points. A flagged leg voids the duel and refunds the Fuel. Until pools exist the feed is everyone's recent public solo runs (one global pool). `DUEL.fuelCost` is 10.

**Tuning decided after the phase 1 simulation** (`npm run sim -- --compare` shows why): the hidden rating moves on the two duel efforts (`RATING.evidence: 'efforts'`), not the combined margin; seasons re-anchor the scale to measured pace (`SEASON.reanchor`) instead of squashing it (`squash: 1`); `RATING.kEstablished` is 20. Cherry-picking a soft ghost from the feed is worth ~12% more points per duel under the combined-margin points rule — accepted for now, to revisit with the points economy in phase 4. The in-run gap is green when leading, garnet when trailing.

## Kill list — never reintroduce

- Stranger matchmaking of any kind for live duels: proximity radius (`DISCOVERY_RADIUS_M`), presence/online tracking for discovery, rating-spread stranger pairing, the quick-match queue. There is **no geographic constraint anywhere** in the game.
- Bots or seeded fake players. Cold-start content is **house ghosts**, clearly labelled ("Ghost — Sapphire pace"), built from real recorded runs, never holding a pool slot a human could win, never collecting the bounty.
- Manual result entry for ranked runs. Results settle from tracked GPS, always.
- The bare player-id credential (`x-player-id`, `?playerId=`). A session token is the only credential.
- Video/voice calls — a possible future add-on to live friend duels; not now, and nothing should be built against it either.
- Showing the hidden rating (or anything derived from it, like a rating chart) to players.
- Timers other than Sunday night. Nothing in the game expires mid-week.

## Commands

Node 22 is pinned (`.nvmrc` / `.node-version`) so `better-sqlite3` installs from a prebuilt binary.

```bash
npm install
npm test           # node:test suites (server/**/*.test.js) — engine, migrations, auth, sim
npm run sim        # rating simulation report for config/game.js
npm run sim -- --compare                   # standard variants side by side, averaged over seeds
npm run sim -- --rating.evidence efforts   # override any tunable: --rating.* --points.* --season.* --world.*
npm run build      # installs client deps and builds client/ into client/dist
npm start          # one Fastify process serves API + built frontend on :3000
npm run dev        # server only, restarts on change (node --watch)
npm run dev:client # Vite on :5173, proxies /api and /ws to :3000 — run alongside npm run dev
```

The server runs without a client build — it warns and serves the API only. Geolocation and the wake lock need a secure context: `localhost` works, a bare LAN IP does not.

## Architecture

One Node process, one origin: Fastify serves the JSON API, the static Vite build, and takes the raw HTTP upgrade for `/ws` itself. No CORS, nothing deploys separately. Challenges, the feed and everything ranked are plain HTTP (+ polling); the WebSocket exists only for live friend duels.

### Server (`server/`)

- `config/env.js` — deployment settings from the environment (port, database path, SMS keys). `config/game.js` — **every game-balance number** (rating curve, K-factors, duel points, seasons; later Fuel, Shards, caps, bounty growth). Game numbers are versioned code, never env vars, never inline.
- `db/` — SQLite via better-sqlite3, WAL. Schema changes are **numbered migration files** in `db/migrations` (`NNN_name.sql`, or `.js` exporting `up(db, log)`), applied at import by `db/migrate.js` and recorded in `schema_migrations`. Each runs in a transaction with foreign keys off and a `foreign_key_check` before commit — so a migration that deletes rows deletes their dependants explicitly. Never edit an applied migration; add a new one.
- `auth/` — the sign-in seam. **Game code imports `auth/index.js` and nothing else under `auth/`; auth imports nothing from the game.** Everything crossing the seam is a player id, plus hooks the game passes to `registerAuth` (`createPlayer`, `describePlayer`, `onPlayerCreated`). Identities live in `auth_identities` (provider, subject → player); today's only provider is `auth/phone` (texted code via textbee). A real provider or OAuth is a new directory there, with no game changes.
- `lib/rating.js` — **the hidden rating engine. Pure and deterministic: no I/O, no clock, no randomness.** Every function takes its tunables last, defaulting to `config/game.js`, so the simulator sweeps the exact code that settles real duels. Covered by `lib/rating.test.js` (unit + seeded property tests).
- `sim/` — the simulation harness: synthetic runners with known true ability (`world.js`, assumptions about real runners — not game rules), weekly pools of ghost duels through the real engine (`simulate.js`), and the report (`report.js`). Any change to the engine or its numbers gets a before/after `npm run sim -- --compare`.
- `lib/serialize.js` decides what the wire sees — never hand raw rows to a route or socket, and never serialise the hidden rating.
- `lib/track.js` — parses and checks an uploaded GPS track (the same filter as the client tracker) and flags runs to quarantine (too fast, too noisy): stored, pays nothing, takes nothing. `lib/economy.js` — pure Shards/Fuel/points/streak maths and the Europe/Dublin calendar (days, weeks named by their Monday). `lib/ladder.js` — tiers and their labels.
- `db/runs.js` records a run with its track and ledger rows (`point_events`, `fuel_events`) in one transaction; `(player_id, started_at)` is unique, so a re-sent run returns the first one (`duplicate: true`) and never pays twice.
- `lib/ghost.js` — a run as a ghost: its distance profile ([ms since first accepted fix, metres], from `track.js` `walkTrack`) — never coordinates, so racing someone never reveals where they run. Times a leg to a distance (a track stopping within `DUEL.finishToleranceM` of the line is extrapolated; short of that it is a quit). Uploads are measured after a round trip through storage precision, so a replay of the stored track reproduces the settled numbers exactly.
- `lib/duel.js` maps a stored duel to `rating.settleDuel`; `db/duels.js` owns the state machine (`leg1` → `awaiting` → `leg2` → `settled` | `void`), Fuel, points and hidden-rating writes, each in one transaction; settling is idempotent. `jobs/sunday.js` runs `settleDue` every minute (and at boot), so a restart over Sunday midnight catches up.
- `app.js` builds the Fastify app (auth seam, `routes/me.js`, `routes/runs.js`, `routes/duels.js` — feed, challenge, reply) so tests use `inject`; `index.js` adds the socket, the Sunday job, static files and `listen`.
- `ws/hub.js` — live friend duels only (dormant until phase 5, see *Rework status*).

### The hidden rating (`lib/rating.js`)

A rating is a pace: 1000 runs 5 km in 30:00, every 1000 points halves the time (100 ≈ 7% faster), other distances follow Riegel's curve. So two ratings predict a finishing gap at any distance, and a real run is a measurement of a rating. A **ghost duel** has two legs — the challenger races a recording of one of the target's runs, then the target races the challenger's run back — and is decided on the **combined margin**. Ratings move on the **surprise** (actual vs expected), squashed through tanh so no single result moves anyone more than K; K decays from provisional to established over five results; the winner never loses rating. A **quit leg counts as finished at the expected losing margin** plus a bad-day penalty, through the same formula, so finishing is never worse than quitting and quitting never gains. No reply by Sunday is a **walkover**: a fixed points steal, no rating change. Seasons reset every `SEASON.lengthWeeks`; re-anchoring (`paceDrift`) measures how far the scale has drifted from real pace and shifts it back. Points from duels scale with the surprise, so upsets pay more and the visible table inherits the fairness without exposing the maths.

### Game rules that must hold everywhere

- **Solo never costs and never loses anything.** Not points, not Fuel, not Shards. A solo run can be challenged as a ghost unless marked private (a toggle, not a mode).
- **Duel legs settle from tracked GPS only.** Quitting counts as completing at the expected losing margin.
- **Sunday settles everything.** It is the only timer.
- **Live friend duels move no points and no hidden rating** — pride and wagered Fuel only.
- **The bounty only ever sits on the pool leader.**
- **Imported and self-reported data is untrusted**: provisional rating, provisional badge until ~5 in-app runs.
- **Anti-cheat is quiet**: flagged runs settle unranked and are marked for review; no public cheater labels.
- **Mid-run state has one source of truth in the tracker** (not scattered React state), so it can later feed lock-screen surfaces.

### Client (`client/src/`)

React 19 + Vite + Tailwind v4. No router: `App.jsx` switches tabs from local state (today Run · You; target Run · Pool · Friends · You), and a run in progress takes over the whole screen (`pages/Running.jsx`). `state/session.jsx` owns sign-in state and the socket; the socket authenticates with the session token only. `lib/tracker.js` is the GPS filter (rejects fixes worse than 25 m accuracy or implying > 11 m/s, holds sub-3 m steps as jitter) with a test bench at `/debug`. `lib/run.js` is **the run store — the one source of truth mid-run** (phase, distance, clock, pace, GPS state, result), read through `useRun()`; it records raw fixes and keeps a finished run in `localStorage` (`gapped.pendingRun`) until the server has it, retrying on next launch. A duel leg (`run.startLeg`) replays the ghost (`lib/ghost.js`), clocks from the first accepted fix like the server, measures the gap like for like (your distance at your latest fix vs the ghost at that moment), and ends itself at the line. `pages/Duels.jsx` is the duel hub: replies, ghosts to race, waiting, results. The in-run screen (`pages/Running.jsx`) is a tilted 3D map over the numbers: `components/RunMap.jsx` draws your route, you, and the ghost — placed on *your own* route by the gap, since ghosts carry no coordinates (`lib/routeGeo.js`) — and follows and turns with you. It is only a view of the run store. The style (`lib/mapStyle.js`) starts with local layers only and adds the city (OpenFreeMap vector tiles: free, no key, attribution required and shown) after load, so no signal never blanks the route. MapLibre is served unbundled from `/vendor/maplibre-<version>/` by a plugin in `client/vite.config.js` — its worker must sit next to its own script — and loads only when a run starts.

### Design system ("Shard Mono")

Swiss-minimal editorial: warm off-white paper, near-black ink, structure from 1px hairlines only — no cards, no grey fills, no shadows. Archivo, 900-weight numerals, uppercase 11–13px labels. Two brand colours: indigo `#4F46E5` (the accent) and garnet `#A43F5E` (the nemesis, and trailing in a duel — the in-run gap is green (`--color-win`) when ahead and garnet when behind). Selection marks (radios, the active tab) are ink, not indigo. Primary actions are filled ink pills. Touch targets ≥ 56px. Units are metric everywhere. Match this before adding any new UI.

Deliberate departures, all from the Claude Design handoff:

- **Rank backgrounds.** Home sits on a live background cut for the runner's tier (`components/RankBackground.jsx`, recipes in `lib/rankBackground.js`): Bronze is CSS, the rest are self-contained WebGL custom elements in `lib/shaders/`, each lazy-loaded with dark and light palettes that ease across on a theme switch. While Home shows, the shell carries `.rank-glass`. The background is `z-0` and header/main are `relative` with no z-index — do not give them one, or Home's fixed sheets get trapped under the tab bar. Tiers are the visible ladder rank (tiers → divisions → pools), not the hidden rating; Shards unlock cosmetics within a tier.
- **Split sheet.** `components/DuelSheet.jsx`, driven frame by frame by `lib/duelRig.js` (springs, liquid seam, drag-up red wash). Becomes the Solo / Duel picker.
- **Outcome colours.** Duel history uses green (`--color-win`) and red (`--color-loss`) / garnet; ties muted. Nowhere else.
- **Tier weather.** The crystal cluster carries per-tier effects (gold glints, amethyst arcs, diamond stars, garnet void-beams). `components/Crystal.jsx` meshes are seeded per tier so every render cuts the same stone.

The signed-out onboarding (`pages/Onboarding.jsx`, `.ob-*` styles) is a committed-dark world that ignores the paper/ink theme and ends the moment sign-in does.

## Engineering rules

- The rating engine and settlement are the product: pure functions, unit and property tests, and the simulator. Test them like it.
- Schema changes are migrations, never drift.
- Tunables live in `config/game.js`.
- Small commits per phase; every phase leaves the app runnable.
- Where the spec is ambiguous — especially scoring or anti-cheat — ask rather than invent.

## Deployment

Railway, configured by `railway.json` (Nixpacks build, `npm start`, `/api/health` check). Nixpacks sets `NODE_ENV=production`. `DATABASE_PATH` must point at a mounted volume or every redeploy wipes the database; migrations run on boot. `AUTH_CODE_ECHO` can never be on in production — setting it there stops the server from starting, so production sign-in needs `TEXTBEE_API_KEY`. `/api/health` reports the built commit from Railway's env vars — the only way to tell from outside whether a push deployed.
