import { TRACK } from '../config/game.js'
import { distanceMetres } from './geo.js'

/**
 * Recorded runs: what the phone uploads, how the server checks it, and how it
 * is stored. Pure — the caller supplies `now`.
 *
 * A track is the raw fixes the phone saw, in order:
 *   { t, lat, lng, acc?, alt?, steps? }
 * t is epoch ms; acc is the reported accuracy in metres; steps is a
 * cumulative step count where the platform gives one (room for anti-cheat).
 *
 * The server never trusts the phone's own totals: distance and time are
 * recomputed here with the same filter the phone runs live
 * (client/src/lib/tracker.js).
 */

export class TrackError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const finiteOrNull = (v) => (v == null ? null : Number.isFinite(v) ? v : NaN)

/** Validate and normalise an uploaded track. Throws TrackError. */
export function parseTrack(raw, { now }, cfg = TRACK) {
  if (!Array.isArray(raw)) throw new TrackError('track_missing', 'A run needs its GPS track.')
  if (raw.length < 2) throw new TrackError('track_short', 'That run has too few GPS fixes to count.')
  if (raw.length > cfg.maxSamples) throw new TrackError('track_long', 'That track is too large.')

  const points = raw.map((p, i) => {
    const point = {
      t: Number(p?.t),
      lat: Number(p?.lat),
      lng: Number(p?.lng),
      acc: finiteOrNull(p?.acc),
      alt: finiteOrNull(p?.alt),
      steps: finiteOrNull(p?.steps),
    }
    const bad =
      !Number.isFinite(point.t) || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) ||
      Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180 ||
      Number.isNaN(point.acc) || Number.isNaN(point.alt) || Number.isNaN(point.steps) ||
      (point.acc != null && point.acc < 0) || (point.steps != null && point.steps < 0)
    if (bad) throw new TrackError('track_invalid', `GPS fix ${i} is malformed.`)
    return point
  })

  for (let i = 1; i < points.length; i++) {
    if (points[i].t <= points[i - 1].t) {
      throw new TrackError('track_order', 'GPS fixes must be in time order.')
    }
  }
  const first = points[0].t
  const last = points.at(-1).t
  if (last > now + cfg.clockSkewMs) throw new TrackError('track_future', 'That run ends in the future.')
  if (first < now - cfg.maxAgeMs) throw new TrackError('track_stale', 'That run is too old to upload.')
  if (last - first > cfg.maxDurationMs) throw new TrackError('track_long', 'That run is longer than any run can be.')
  return points
}

/**
 * Walk a track with the filter the phone runs live: fixes worse than the
 * accuracy limit are dropped, a fix implying an impossible speed from the
 * last accepted one is dropped, and movement under the jitter floor holds
 * the anchor. Returns the totals and the distance profile — cumulative
 * metres at each accepted fix, timed from the first accepted fix. The
 * profile is what a ghost is: how far the runner had got, and when.
 *
 * Fixes before the first good one are the GPS warming up — a duel leg even
 * asks the runner to wait for them — so they are counted apart from the
 * fixes rejected mid-run, and do not make a run look noisy.
 */
export function walkTrack(points, cfg = TRACK) {
  let anchor = null
  let lastAccepted = null
  let firstAccepted = null
  let distanceM = 0
  let accepted = 0
  let rejected = 0
  let warmup = 0
  const profile = []
  for (const p of points) {
    if (p.acc != null && p.acc > cfg.maxAccuracyM) {
      if (anchor) rejected += 1
      else warmup += 1
      continue
    }
    if (anchor) {
      const step = distanceMetres(anchor.lat, anchor.lng, p.lat, p.lng)
      const seconds = Math.max((p.t - anchor.t) / 1000, 0.001)
      if (step / seconds > cfg.maxSpeedMps) {
        rejected += 1
        continue
      }
      if (step >= cfg.minStepM) {
        distanceM += step
        anchor = p
      }
    } else {
      anchor = p
      firstAccepted = p
    }
    lastAccepted = p
    accepted += 1
    profile.push([p.t - firstAccepted.t, distanceM])
  }
  return { distanceM, accepted, rejected, warmup, firstAccepted, lastAccepted, profile }
}

/**
 * Distance and time the way the phone counts them (see walkTrack), plus the
 * plausibility flags that settle a run unranked.
 */
export function summariseTrack(points, cfg = TRACK) {
  const { distanceM, accepted, rejected, lastAccepted } = walkTrack(points, cfg)
  const startedAt = points[0].t
  const endedAt = points.at(-1).t
  const elapsedMs = endedAt - startedAt
  const flags = []
  if (elapsedMs > 0 && distanceM / (elapsedMs / 1000) > cfg.maxAverageSpeedMps) flags.push('too_fast')
  if (rejected / (accepted + rejected) > cfg.maxRejectedShare) flags.push('noisy')
  return {
    distanceM,
    elapsedMs,
    startedAt,
    endedAt,
    accepted,
    rejected,
    hasSteps: points.some((p) => p.steps != null),
    lastFixAt: lastAccepted?.t ?? null,
    flags,
  }
}

/**
 * Compact storage: times as offsets from the first fix, coordinates as
 * integer micro-degrees (~0.1 m), optional fields null. Format 1.
 */
export function encodeTrack(points) {
  const t0 = points[0].t
  return JSON.stringify({
    v: 1,
    t0,
    p: points.map((p) => [
      p.t - t0,
      Math.round(p.lat * 1e6),
      Math.round(p.lng * 1e6),
      p.acc == null ? null : Math.round(p.acc * 10) / 10,
      p.alt == null ? null : Math.round(p.alt * 10) / 10,
      p.steps == null ? null : Math.round(p.steps),
    ]),
  })
}

export function decodeTrack(text) {
  const { v, t0, p } = JSON.parse(text)
  if (v !== 1) throw new TrackError('track_format', `Unknown track format ${v}.`)
  return p.map(([dt, lat, lng, acc, alt, steps]) => ({
    t: t0 + dt, lat: lat / 1e6, lng: lng / 1e6, acc, alt, steps,
  }))
}
