import { useId } from 'react'

/**
 * XenoMark — the "resolved signal" brand reticle.
 * Outer ring (the unknown) + inner lens + scan line resolving to a bright
 * phoneme dot trailed by fading echoes. Sized by width; aspect ~44:24.
 */
export function XenoMark({ size = 28, glow = true }: { size?: number; glow?: boolean }) {
  const id = useId()
  return (
    <svg width={size} height={size * 0.55} viewBox="0 0 44 24" fill="none" style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id={id} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9affc7" />
          <stop offset="60%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </radialGradient>
      </defs>
      {/* Outer ring (the unknown) */}
      <circle cx="11" cy="12" r="9" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" fill="none" />
      {/* Inner lens */}
      <circle cx="11" cy="12" r="3" stroke="var(--accent)" strokeWidth="1.2" fill="none" />
      {/* Scan line exiting */}
      <line
        x1="20" y1="12" x2="33" y2="12"
        stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round"
        style={glow ? { filter: 'drop-shadow(0 0 4px var(--accent))' } : undefined}
      />
      {/* Resolved signal dot */}
      <circle
        cx="34.5" cy="12" r="2.2" fill={`url(#${id})`}
        style={glow ? { filter: 'drop-shadow(0 0 6px var(--accent))' } : undefined}
      />
      {/* Trailing echoes */}
      <circle cx="38" cy="12" r="0.9" fill="var(--accent)" opacity="0.6" />
      <circle cx="40.5" cy="12" r="0.7" fill="var(--accent)" opacity="0.3" />
      <circle cx="42.5" cy="12" r="0.5" fill="var(--accent)" opacity="0.15" />
    </svg>
  )
}

/** Lowercase wordmark — "xeno" light/dim, "linguist" solid. */
export function XenoWordmark({ size = 14 }: { size?: number }) {
  return (
    <span style={{ fontFamily: 'var(--font-display)', fontSize: size, fontWeight: 500, letterSpacing: '-0.01em' }}>
      <span style={{ fontWeight: 300, opacity: 0.7 }}>xeno</span>
      <span>linguist</span>
    </span>
  )
}
