import { useEffect, useRef, useState } from 'react'
import { clock, metres } from '../lib/format.js'
import { Label } from './ui.jsx'

const HEIGHT = 132
const PAD = { top: 12, right: 8, bottom: 22, left: 8 }

/** Hours and minutes for a week's running: 3h 05m, or 42:10 under an hour. */
function duration(ms) {
  if (ms < 3_600_000) return clock(ms)
  const minutes = Math.round(ms / 60_000)
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

const MONTH = (week) =>
  new Date(`${week}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })
const DAY_MONTH = (week) =>
  new Date(`${week}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** A round kilometre ceiling for the axis, so the top line reads cleanly. */
function niceMaxKm(km) {
  if (km <= 0) return 5
  const step = km <= 10 ? 5 : km <= 40 ? 10 : km <= 100 ? 20 : 50
  return Math.ceil(km / step) * step
}

/**
 * Twelve weeks of distance as one line — the week's totals above it, the
 * current week unless you touch another. `weeks` is oldest first, as
 * /api/me/weeks sends it.
 */
export default function WeeklyChart({ weeks }) {
  const box = useRef(null)
  const [width, setWidth] = useState(0)
  const [picked, setPicked] = useState(weeks.length - 1)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const week = weeks[picked] ?? weeks.at(-1)
  const maxKm = niceMaxKm(Math.max(...weeks.map((w) => w.distanceM / 1000)))
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const step = weeks.length > 1 ? plotW / (weeks.length - 1) : 0
  const x = (i) => PAD.left + i * step
  const y = (m) => PAD.top + plotH - (m / 1000 / maxKm) * plotH
  const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.distanceM).toFixed(1)}`).join(' ')
  const area = `${line} L${x(weeks.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
  const current = picked === weeks.length - 1

  // Label a month at the first week that starts in it, as a running calendar does.
  const monthTicks = weeks
    .map((w, i) => ({ i, month: MONTH(w.week), first: i === 0 || MONTH(weeks[i - 1].week) !== MONTH(w.week) }))
    .filter((t) => t.first && t.i > 0)

  function pickFrom(event) {
    const rect = box.current.getBoundingClientRect()
    const i = Math.round((event.clientX - rect.left - PAD.left) / (step || 1))
    setPicked(Math.min(weeks.length - 1, Math.max(0, i)))
  }

  function onKey(event) {
    if (event.key === 'ArrowLeft') setPicked((i) => Math.max(0, i - 1))
    else if (event.key === 'ArrowRight') setPicked((i) => Math.min(weeks.length - 1, i + 1))
    else return
    event.preventDefault()
  }

  return (
    <div>
      <Label>{current ? 'This week' : `Week of ${DAY_MONTH(week.week)}`}</Label>
      <div className="mt-2 grid grid-cols-3">
        <WeekStat label="Distance" value={metres(week.distanceM)} />
        <WeekStat label="Time" value={week.elapsedMs ? duration(week.elapsedMs) : '—'} />
        <WeekStat label="Runs" value={week.runs} />
      </div>

      <div
        ref={box}
        className="relative mt-4 touch-pan-y select-none outline-none focus-visible:ring-1 focus-visible:ring-ink"
        style={{ height: HEIGHT }}
        tabIndex={0}
        role="group"
        aria-label="Distance per week, last 12 weeks. Use the arrow keys to pick a week."
        onPointerDown={pickFrom}
        onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons) && pickFrom(e)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setPicked(weeks.length - 1)}
        onKeyDown={onKey}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} className="block overflow-visible" aria-hidden="true">
            {/* Recessive frame: the top of the scale and the baseline. */}
            <line x1={PAD.left} x2={width - PAD.right} y1={y(maxKm * 1000)} y2={y(maxKm * 1000)} className="stroke-rule" strokeDasharray="2 3" />
            <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} className="stroke-rule" />
            <text x={width - PAD.right} y={y(maxKm * 1000) - 4} textAnchor="end" className="fill-muted nums text-[11px]">
              {maxKm} km
            </text>

            <path d={area} className="fill-indigo" fillOpacity="0.1" />
            <line x1={x(picked)} x2={x(picked)} y1={PAD.top} y2={y(0)} className="stroke-ink" strokeWidth="1" />
            <path d={line} fill="none" className="stroke-indigo" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {weeks.map((w, i) => (
              <circle
                key={w.week}
                cx={x(i)}
                cy={y(w.distanceM)}
                r={i === picked ? 5.5 : 4}
                className={i === picked ? 'fill-indigo stroke-paper' : 'fill-paper stroke-indigo'}
                strokeWidth="2"
              />
            ))}

            {monthTicks.map((t) => (
              <text key={t.i} x={x(t.i)} y={HEIGHT - 4} textAnchor="middle" className="fill-muted label text-[11px]">
                {t.month}
              </text>
            ))}
          </svg>
        )}
      </div>

      <table className="sr-only">
        <caption>Distance per week</caption>
        <thead>
          <tr><th>Week of</th><th>Distance</th><th>Time</th><th>Runs</th></tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <td>{DAY_MONTH(w.week)}</td>
              <td>{metres(w.distanceM)}</td>
              <td>{w.elapsedMs ? duration(w.elapsedMs) : '—'}</td>
              <td>{w.runs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WeekStat({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="display nums text-[22px]">{value}</span>
    </div>
  )
}
