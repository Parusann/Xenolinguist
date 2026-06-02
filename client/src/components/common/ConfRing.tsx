/** Confidence bucket → color, matching the design's thresholds. */
export type ConfBucket = 'confirmed' | 'probable' | 'unknown'
export const confBucket = (v: number): ConfBucket => (v >= 76 ? 'confirmed' : v >= 41 ? 'probable' : 'unknown')
const COLOR: Record<ConfBucket, string> = {
  confirmed: 'var(--conf-confirmed)',
  probable: 'var(--conf-probable)',
  unknown: 'var(--conf-unknown)',
}

/**
 * ConfRing — circular confidence indicator (SVG progress ring + center number).
 * Used across Vocabulary cards/inspector and the Dashboard hero tile.
 */
export function ConfRing({ value, size = 36, stroke = 3 }: { value: number; size?: number; stroke?: number }) {
  const clamped = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - clamped / 100)
  const color = COLOR[confBucket(clamped)]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
      <circle className="cring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
      <circle
        className="cring-bar"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize={size * 0.3}
        fill={color}
      >
        {Math.round(clamped)}
      </text>
    </svg>
  )
}
