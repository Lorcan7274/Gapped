/**
 * Duel formats. Everything is metric: the gap the whole product is built on
 * is measured in metres, so there is one unit system and no toggle.
 */

export const formatDuration = (minutes) =>
  minutes === 1 ? '1 minute' : `${minutes} minutes`

export const formatMetres = (m) =>
  m < 1000 ? `${m} m` : `${m % 1000 === 0 ? m / 1000 : (m / 1000).toFixed(1)} km`

/**
 * Quick match runs exactly two fixed formats — a random opponent agrees to
 * a format, not a negotiation, and two pools are the most a small player
 * base keeps liquid. The numbers mirror QUICK_FORMATS on the server, which
 * /api/meta serves as the source of truth; this copy is a fallback for
 * before meta loads, merged by key so words live here and numbers there.
 */
export const QUICK_FORMATS = [
  {
    key: 'race',
    name: 'Race',
    blurb: 'First to the kilometre wins.',
    mode: 'race',
    distanceM: 1000,
  },
  {
    key: 'distance',
    name: 'Distance',
    blurb: 'Most metres before the clock runs out.',
    mode: 'timed',
    durationMs: 600_000,
  },
]

export const formatsFrom = (meta) =>
  meta?.formats?.length
    ? meta.formats.map((format) => ({
        ...QUICK_FORMATS.find((local) => local.key === format.key),
        ...format,
      }))
    : QUICK_FORMATS

/** '1 km' or '10 minutes' — the amount a quick format runs. */
export const formatDetail = ({ mode, distanceM, durationMs }) =>
  mode === 'timed' ? formatDuration(durationMs / 60_000) : formatMetres(distanceM ?? 0)

/**
 * Custom presets for a direct challenge, where the full menu is fair game —
 * you know who you are asking. `param` is minutes for a timed duel and
 * metres for a fixed-distance one.
 */
export const DUEL_TYPES = [
  {
    key: 'distance',
    name: 'Distance duel',
    unit: 'minutes',
    param: 5,
    detail: '5 minutes',
    blurb: 'Most metres before the clock runs out.',
  },
  {
    key: 'pace',
    name: 'Pace duel',
    unit: 'metres',
    param: 1000,
    detail: '1 km',
    blurb: 'First to the distance wins.',
  },
  {
    key: 'sprint',
    name: 'Sprint duel',
    unit: 'metres',
    param: 100,
    detail: '100 m',
    blurb: 'Short and flat out.',
  },
]

/** Durations a custom challenge can run, offered in DuelSetup. */
export const CUSTOM_DURATIONS = [1, 2, 5, 10, 20, 30]

/**
 * Distances and durations the server will accept, from /api/meta. Keeping a
 * second copy here is what let the sprint preset offer 100 m for a distance
 * the server rejected, so these are only fallbacks for before meta loads.
 */
export const FALLBACK_DISTANCES = [100, 200, 400, 800, 1000, 2000, 3000, 5000]
export const distancesFrom = (meta) =>
  meta?.distances?.length ? meta.distances : FALLBACK_DISTANCES
export const durationsFrom = (meta) =>
  meta?.durationsMinutes?.length ? meta.durationsMinutes : CUSTOM_DURATIONS

/** The wire payload for a direct challenge in a chosen custom shape. */
export const challengePayload = (opponentId, { unit, param }) =>
  unit === 'minutes'
    ? { opponentId, mode: 'timed', durationMs: param * 60_000 }
    : { opponentId, mode: 'race', distanceM: param }

export const describe = ({ type, unit, param }) => {
  const base = DUEL_TYPES.find((t) => t.key === type)?.name ?? 'Duel'
  return `${base} · ${unit === 'minutes' ? formatDuration(param) : formatMetres(param)}`
}
