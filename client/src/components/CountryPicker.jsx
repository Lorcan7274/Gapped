import { useEffect, useMemo, useRef, useState } from 'react'
import { COUNTRIES, flagUrl } from '../lib/countries.js'

/** A little round flag; the bare ISO code fills in if the image fails. */
export function FlagDisc({ code, size = 30 }) {
  // Remember which country failed, not that one failed: the phone step keeps
  // one disc mounted across picks, and a single bad load (offline moment)
  // must not stick every later country with the text fallback.
  const [brokenFor, setBrokenFor] = useState(null)
  const broken = brokenFor === code
  return (
    <span
      className="flex flex-none items-center justify-center overflow-hidden rounded-full bg-white/10"
      style={{ width: size, height: size }}
    >
      {broken ? (
        <span className="text-[9px] font-700 tracking-wide text-[#fafaf7]/70">{code}</span>
      ) : (
        <img
          src={flagUrl(code)}
          srcSet={`${flagUrl(code, 80)} 2x`}
          alt=""
          // The sheet keeps every country mounted so it can slide, and there
          // are 200-odd of them: eager flags would be 200-odd requests fired
          // the moment the phone step renders, for a list nobody has opened.
          loading="lazy"
          decoding="async"
          onError={() => setBrokenFor(code)}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  )
}

/**
 * Full-screen country sheet for the phone step. Stays mounted so it can
 * slide up over the form and drop back down; `open` drives the transition.
 */
export default function CountryPicker({ open, current, onPick, onClose }) {
  const [query, setQuery] = useState('')
  const listRef = useRef(null)

  // A reopened picker starts from the top with yesterday's search cleared.
  useEffect(() => {
    if (!open) return
    setQuery('')
    listRef.current?.scrollTo?.(0, 0)
  }, [open])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRIES
    const dial = q.replace(/^\+/, '')
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase() === q ||
        (dial && /^\d+$/.test(dial) && c.dial.startsWith(dial))
    )
  }, [query])

  return (
    <div className={`ob-picker ${open ? '' : 'is-closed'}`} aria-hidden={!open}>
      <div className="ob-top flex items-center gap-3 px-4 pb-3">
        <label className="flex min-h-[44px] flex-1 items-center gap-2.5 rounded-xl bg-white/12 px-3.5">
          <svg viewBox="0 0 24 24" className="size-[15px] text-[#fafaf7]/50" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <path d="M15.5 15.5 L21 21" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country / region"
            aria-label="Search country or region"
            tabIndex={open ? 0 : -1}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[#fafaf7] caret-[#c4b5fd] placeholder:text-[#fafaf7]/45 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={onClose}
          tabIndex={open ? 0 : -1}
          className="ob-link min-h-[44px] px-1 text-[15px]"
        >
          Cancel
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto pb-6">
        {matches.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => onPick(c.code)}
            tabIndex={open ? 0 : -1}
            className="flex min-h-[56px] w-full items-center gap-3.5 border-b border-[#fafaf7]/8 px-5 text-left"
          >
            <FlagDisc code={c.code} />
            <span className="nums min-w-[52px] text-[15px] font-700 text-[#fafaf7]/70">+{c.dial}</span>
            <span className="flex-1 truncate text-[16px] text-[#fafaf7]">{c.name}</span>
            {c.code === current && (
              <svg viewBox="0 0 24 24" className="size-4 text-[#a5b4fc]" aria-hidden="true">
                <path d="M5 12.5 L10 17 L19 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        ))}
        {matches.length === 0 && (
          <p className="px-5 pt-8 text-[14px] text-[#fafaf7]/50">
            Nothing matches "{query.trim()}".
          </p>
        )}
      </div>
    </div>
  )
}
