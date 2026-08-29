/* Shard Mono primitives. No cards, no fills, no shadows — rules and space. */

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'btn-primary',
    outline: 'btn-outline',
    quiet: 'btn-quiet',
  }
  return (
    <button className={`btn ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Label({ children, className = '', as: As = 'p' }) {
  return <As className={`label text-muted ${className}`}>{children}</As>
}

export function Rule({ ink = false, className = '' }) {
  return <div className={`${ink ? 'rule-ink' : 'rule'} ${className}`} />
}

/** Small tier word. No pill, no fill — this system does not do badges. */
export function TierBadge({ tier, className = '' }) {
  if (!tier) return null
  return <span className={`label text-muted ${className}`}>{tier.name}</span>
}

export function Spinner({ className = '' }) {
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border border-rule border-t-ink ${className}`}
      aria-hidden="true"
    />
  )
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="flex flex-col items-start gap-3 py-14">
      <h3 className="display text-[28px]">{title}</h3>
      <p className="max-w-[17rem] text-[15px] leading-relaxed text-slate">{body}</p>
      {action}
    </div>
  )
}

/**
 * Connected is the normal state and says nothing. Only a degraded
 * connection earns a word in the header.
 */
export function ConnectionStatus({ status }) {
  if (status === 'reconnecting') return <span className="label text-garnet">Reconnecting</span>
  if (status === 'offline') return <span className="label text-garnet">Offline</span>
  return null
}

/** A headline stat: tiny label over a heavy numeral. */
export function Stat({ label, value, tone = 'ink', size = 'text-[34px]' }) {
  const tones = { ink: 'text-ink', indigo: 'text-indigo', garnet: 'text-garnet', muted: 'text-muted' }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label text-muted">{label}</span>
      <span className={`display ${size} ${tones[tone]}`}>{value}</span>
    </div>
  )
}
