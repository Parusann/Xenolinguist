/**
 * HeroMark — the brand reticle, exact port of the designer prototype's HeroMark
 * (prototypes/hero/Hero.jsx). Kept separate from the workbench `XenoMark` so the
 * marketing hero renders pixel-identical to the prototype (width = size*2).
 */
export function HeroMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size * 2} height={size} viewBox="0 0 44 24" fill="none" style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="hm-dot" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9affc7" />
          <stop offset="60%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </radialGradient>
      </defs>
      <circle cx="11" cy="12" r="9" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" fill="none" />
      <circle cx="11" cy="12" r="3" stroke="var(--accent)" strokeWidth="1.2" fill="none" />
      <line x1="20" y1="12" x2="33" y2="12" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 4px var(--accent))' }} />
      <circle cx="34.5" cy="12" r="2.2" fill="url(#hm-dot)"
              style={{ filter: 'drop-shadow(0 0 6px var(--accent))' }} />
      <circle cx="38" cy="12" r="0.9" fill="var(--accent)" opacity="0.6" />
      <circle cx="40.5" cy="12" r="0.7" fill="var(--accent)" opacity="0.3" />
      <circle cx="42.5" cy="12" r="0.5" fill="var(--accent)" opacity="0.15" />
    </svg>
  )
}
