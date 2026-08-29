/**
 * Duel formats. Everything is metric: the gap the whole product is built on
 * is measured in metres, so there is one unit system and no toggle.
 *
 * `param` is minutes for a timed duel and metres for a fixed-distance one.
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

/** Custom presets, offered when you pick Custom or challenge your nemesis. */
export const CUSTOM_DURATIONS = [1, 2, 5, 10, 20, 30]
export const CUSTOM_DISTANCES = [100, 200, 400, 800, 1000, 2000, 5000]

export const formatDuration = (minutes) =>
  minutes === 1 ? '1 minute' : `${minutes} minutes`

export const formatMetres = (m) =>
  m < 1000 ? `${m} m` : `${m % 1000 === 0 ? m / 1000 : (m / 1000).toFixed(1)} km`

export const describe = ({ type, unit, param }) => {
  const base = DUEL_TYPES.find((t) => t.key === type)?.name ?? 'Duel'
  return `${base} · ${unit === 'minutes' ? formatDuration(param) : formatMetres(param)}`
}
