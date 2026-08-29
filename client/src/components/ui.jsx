export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold ' +
    'transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ' +
    'disabled:cursor-not-allowed select-none'
  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-5 py-3.5 text-base',
    lg: 'w-full px-6 py-4 text-lg',
  }
  const variants = {
    primary: 'bg-surge-500 text-ink-950 hover:bg-surge-400',
    danger: 'bg-flare-500 text-ink-950 hover:bg-flare-400',
    ghost: 'bg-ink-800 text-ink-50 hover:bg-ink-700',
    outline: 'border border-ink-600 text-ink-200 hover:border-ink-400 hover:text-ink-50',
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function TierBadge({ tier, size = 'sm' }) {
  if (!tier) return null
  const pad = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold uppercase tracking-wider ${pad}`}
      style={{ color: tier.colour, backgroundColor: `${tier.colour}1f` }}
    >
      {tier.name}
    </span>
  )
}

export function Card({ children, className = '', ...props }) {
  return (
    <div
      className={`rounded-3xl border border-ink-800 bg-ink-900 p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function Stat({ label, value, tone = 'default' }) {
  const tones = {
    default: 'text-ink-50',
    good: 'text-surge-400',
    bad: 'text-flare-400',
  }
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400">
        {label}
      </span>
      <span className={`nums text-xl font-bold ${tones[tone]}`}>{value}</span>
    </div>
  )
}

export function Spinner({ className = '' }) {
  return (
    <span
      className={`inline-block size-5 animate-spin rounded-full border-2 border-ink-600 border-t-surge-400 ${className}`}
      aria-hidden="true"
    />
  )
}

export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="text-4xl" aria-hidden="true">{icon}</div>
      <h3 className="text-lg font-bold text-ink-50">{title}</h3>
      <p className="max-w-xs text-sm leading-relaxed text-ink-400">{body}</p>
      {action}
    </div>
  )
}

export function ConnectionDot({ status }) {
  const map = {
    open: { colour: 'bg-surge-500', label: 'Live' },
    connecting: { colour: 'bg-volt-400', label: 'Connecting' },
    reconnecting: { colour: 'bg-volt-400', label: 'Reconnecting' },
    offline: { colour: 'bg-flare-500', label: 'Offline' },
    closed: { colour: 'bg-ink-600', label: 'Offline' },
  }
  const { colour, label } = map[status] ?? map.closed
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
      <span className={`size-1.5 rounded-full ${colour}`} />
      {label}
    </span>
  )
}
