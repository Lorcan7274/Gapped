const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
]

/**
 * The onboarding's own dial pad, so the phone and code steps never summon
 * the system keyboard over their layout. Digits and backspace always work;
 * the +*# key only does anything when the caller gives it a meaning
 * (typing a number internationally).
 */
export default function Keypad({ onDigit, onBackspace, onPlus }) {
  return (
    <div className="ob-keypad">
      {KEYS.map(([digit, letters]) => (
        <button
          key={digit}
          type="button"
          aria-label={digit}
          onClick={() => onDigit(digit)}
          className="ob-key"
        >
          <span className="ob-key__digit">{digit}</span>
          <span className="ob-key__letters">{letters || ' '}</span>
        </button>
      ))}

      <button
        type="button"
        aria-label="Plus"
        onClick={() => onPlus?.()}
        className="ob-key ob-key--bare"
      >
        <span className="ob-key__digit">+ * #</span>
        <span className="ob-key__letters">{' '}</span>
      </button>

      <button
        type="button"
        aria-label="0"
        onClick={() => onDigit('0')}
        className="ob-key"
      >
        <span className="ob-key__digit">0</span>
        <span className="ob-key__letters">{' '}</span>
      </button>

      <button
        type="button"
        aria-label="Delete"
        onClick={() => onBackspace()}
        className="ob-key ob-key--bare"
      >
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
          <path
            d="M9 5 H20 A1.6 1.6 0 0 1 21.6 6.6 V17.4 A1.6 1.6 0 0 1 20 19 H9 L3 12 Z"
            fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"
          />
          <path
            d="M11.7 9.6 L16.3 14.4 M16.3 9.6 L11.7 14.4"
            fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
