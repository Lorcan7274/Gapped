import { useState } from 'react'
import { COUNTRIES, DIAL, flagUrl, formatNational } from '../lib/countries.js'

const SIZES = {
  lg: { text: 'text-[19px]', height: 'min-h-[58px]', pad: 'pb-3' },
  md: { text: 'text-[17px]', height: 'min-h-[56px]', pad: 'pb-2' },
}

const EXAMPLE = { 1: '347 261 5518', 353: '87 123 4567', 44: '7911 123456' }

/**
 * A phone number as two parts: the country, picked from the browser's own
 * list (a native picker on a phone, which is what you want), and the number
 * as people say it locally. The parent composes the E.164 form the server
 * needs with `toE164`.
 */
export default function PhoneField({
  country, onCountry, national, onNational, size = 'lg', autoFocus = false,
}) {
  // Keyed by country so one failed load does not stick every later pick
  // with the text fallback (same latch as CountryPicker's FlagDisc).
  const [flagBrokenFor, setFlagBrokenFor] = useState(null)
  const flagBroken = flagBrokenFor === country
  const s = SIZES[size] ?? SIZES.lg
  const dial = DIAL[country] ?? ''

  function change(event) {
    const raw = event.target.value
    // A leading + means the whole thing is international; keep it verbatim.
    if (raw.trim().startsWith('+')) {
      onNational(`+${raw.replace(/\D/g, '').slice(0, 15)}`)
      return
    }
    onNational(raw.replace(/\D/g, '').slice(0, 15))
  }

  return (
    <div className="flex items-stretch gap-3 border-b border-ink">
      <label
        className={`relative flex ${s.height} shrink-0 cursor-pointer items-center gap-2 ${s.pad}`}
      >
        {flagBroken ? (
          <span className="label text-muted">{country}</span>
        ) : (
          <img
            src={flagUrl(country)}
            srcSet={`${flagUrl(country, 80)} 2x`}
            width={28}
            height={20}
            alt=""
            onError={() => setFlagBrokenFor(country)}
            className="h-5 w-7 rounded-[2px] object-cover"
          />
        )}
        <span className={`nums ${s.text} font-700 text-ink`}>+{dial}</span>
        <svg viewBox="0 0 12 12" className="size-3 text-muted" aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <select
          value={country}
          onChange={(e) => onCountry(e.target.value)}
          aria-label="Country"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} (+{c.dial})
            </option>
          ))}
        </select>
      </label>

      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        autoFocus={autoFocus}
        required
        value={formatNational(country, national)}
        onChange={change}
        placeholder={EXAMPLE[dial] ?? 'Your number'}
        aria-label="Phone number"
        className={`nums ${s.height} min-w-0 flex-1 bg-transparent ${s.pad} ${s.text} font-700 text-ink placeholder:text-muted focus:outline-none`}
      />
    </div>
  )
}
