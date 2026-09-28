import { RATING, CALENDAR, SHARDS, FUEL, SOLO_POINTS, STREAK } from '../config/game.js'
import { expectedTime } from './rating.js'

/**
 * The run economy: what a run pays in Shards, Fuel and pool points, and how
 * streaks and the calendar work. Pure and deterministic — the caller supplies
 * timestamps and today's earlier earnings — with every number from
 * config/game.js.
 *
 * Solo never costs anything and never loses anything: every function here
 * returns zero or more.
 */

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))

const dayFormatters = new Map()
function dayFormatter(timeZone) {
  if (!dayFormatters.has(timeZone)) {
    dayFormatters.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }))
  }
  return dayFormatters.get(timeZone)
}

/** The calendar day ('YYYY-MM-DD') a moment falls on, in the game's time zone. */
export function localDay(ts, timeZone = CALENDAR.timeZone) {
  if (!Number.isFinite(ts)) throw new TypeError(`localDay needs a timestamp (got ${ts})`)
  return dayFormatter(timeZone).format(new Date(ts))
}

/** The day `n` days after (or before) a 'YYYY-MM-DD' day. */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** The week a moment falls in, named by its Monday — weeks run Monday to Sunday night. */
export function weekOf(ts, timeZone = CALENDAR.timeZone) {
  const day = localDay(ts, timeZone)
  const [y, m, d] = day.split('-').map(Number)
  const sinceMonday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  return addDays(day, -sinceMonday)
}

/**
 * How hard a run was, relative to the runner: the time their hidden rating
 * predicts at race effort over that distance, divided by the time they took.
 * 1 is race pace; an easy run is around 0.8. Capped, so a mis-rated newcomer
 * cannot turn one fast run into a windfall.
 */
export function intensity(rating, distanceM, elapsedMs, p = RATING, s = SHARDS) {
  if (!(distanceM >= p.minDistanceM) || !(elapsedMs > 0)) return 0
  const expected = expectedTime(rating, Math.min(distanceM, p.maxDistanceM), p)
  return clamp(expected / (elapsedMs / 1000), 0, s.maxIntensity)
}

/** The streak after a qualifying run on `day`. Running twice in a day changes nothing. */
export function nextStreak({ days = 0, lastDay = null } = {}, day) {
  // A run uploaded late, after a newer one, cannot rewrite the streak.
  if (lastDay && day <= lastDay) return { days, lastDay }
  if (lastDay && addDays(lastDay, 1) === day) return { days: days + 1, lastDay: day }
  return { days: 1, lastDay: day }
}

/** A streak shown on a given day: it survives until a whole day is missed. */
export function currentStreak({ days = 0, lastDay = null } = {}, today) {
  if (!lastDay) return 0
  return lastDay === today || addDays(lastDay, 1) === today ? days : 0
}

export function streakMultiplier(days, s = STREAK) {
  return 1 + clamp(days - 1, 0, s.maxBonusDays) * s.bonusPerDay
}

/**
 * What a solo run pays.
 *
 *   minutes      moving time
 *   intensity    from intensity() above
 *   streakDays   the streak including this run
 *   today        { shards, fuel, points } already earned today, for the caps
 */
export function soloRewards(
  { minutes, intensity: effort, streakDays = 1, today = {} },
  cfg = { SHARDS, FUEL, SOLO_POINTS, STREAK }
) {
  const { SHARDS: s, FUEL: f, SOLO_POINTS: sp, STREAK: st } = cfg
  const earned = { shards: 0, fuel: 0, points: 0, ...today }
  const ramp = clamp((minutes - s.minMinutes) / (s.fullMinutes - s.minMinutes), 0, 1)
  const raw = minutes * s.perMinute * clamp(effort, 0, s.maxIntensity) ** s.intensityExponent *
    ramp * streakMultiplier(streakDays, st)
  const shards = Math.max(0, Math.min(Math.round(raw), s.dailyCap - earned.shards))
  const fuel = Math.max(0, Math.min(Math.round(shards * f.perShard), f.dailyCap - earned.fuel))
  const points = Math.max(0, Math.min(Math.round(shards * sp.perShard), sp.dailyCap - earned.points))
  return { shards, fuel, points, capped: Math.round(raw) > shards }
}

/** Whether a run is long enough, in time and distance, to keep a streak going. */
export const countsForStreak = (minutes, distanceM, s = STREAK) =>
  minutes >= s.minMinutes && distanceM >= s.minDistanceM
