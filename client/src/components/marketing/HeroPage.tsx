import { Link } from 'react-router-dom'
import { XenoMark, XenoWordmark } from '@/components/common/XenoMark'

/**
 * Marketing hero page (route "/"). Placeholder scaffold — full cinematic
 * build (Vanta backdrop, DecodeMoment animation, sections) lands in Phase 8.
 */
export function HeroPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <XenoMark size={64} />
      <div style={{ fontSize: 56, lineHeight: 1 }}>
        <XenoWordmark size={56} />
      </div>
      <div className="kicker">Language · Decoding · Workbench</div>
      <Link to="/app" className="btn primary" style={{ marginTop: 8 }}>
        Open workbench →
      </Link>
    </div>
  )
}
