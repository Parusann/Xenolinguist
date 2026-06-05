import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { XenoMark } from '@/components/common/XenoMark'
import { VantaTopology } from '@/components/common/VantaTopology'
import '@/marketing.css'

/** Decorative reticle framing the alien subject in the hero image. */
function HeroReticle() {
  return (
    <svg className="hero-reticle" viewBox="0 0 220 220" fill="none">
      <circle cx="110" cy="110" r="84" stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 5" opacity="0.45" />
      <circle cx="110" cy="110" r="48" stroke="var(--accent)" strokeWidth="1" opacity="0.55" />
      <circle cx="110" cy="110" r="3" fill="var(--accent)" />
      <line x1="110" y1="0" x2="110" y2="34" stroke="var(--accent)" strokeWidth="1" opacity="0.5" />
      <line x1="110" y1="186" x2="110" y2="220" stroke="var(--accent)" strokeWidth="1" opacity="0.5" />
      <line x1="0" y1="110" x2="34" y2="110" stroke="var(--accent)" strokeWidth="1" opacity="0.5" />
      <line x1="186" y1="110" x2="220" y2="110" stroke="var(--accent)" strokeWidth="1" opacity="0.5" />
      <text x="110" y="50" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--accent)" opacity="0.7" letterSpacing="2">SUBJECT</text>
      <text x="110" y="178" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--accent)" opacity="0.7" letterSpacing="2">ERIDIAN</text>
    </svg>
  )
}

/**
 * Marketing hero page (route "/"). Phase 8 build: fixed nav, cinematic image
 * hero with a Vanta topology backdrop reading through below the fold.
 * DecodeMoment animation (Task 27) and below-fold sections (Tasks 29–30) mount
 * into the placeholders here.
 */
export function HeroPage() {
  // The workbench locks the viewport; the hero needs to scroll. This class
  // (scoped in marketing.css) unlocks overflow only while the hero is mounted.
  useEffect(() => {
    document.documentElement.classList.add('marketing-active')
    return () => document.documentElement.classList.remove('marketing-active')
  }, [])

  return (
    <>
      {/* Topology backdrop — fixed behind everything; the hero image covers it,
          and it reads through the translucent sections below the fold. */}
      <VantaTopology opacity={0.85} style={{ position: 'fixed', zIndex: 0 }} />

      <div className="hero-page">
        <section className="hero-stage">
          <div className="hero-bg-image" />
          <HeroReticle />

          {/* Corner caption */}
          <div className="hero-caption">
            <span className="ln" />
            <span className="ttl">Field Capture · 04.06.2026</span>
            <span>Eridian first-contact corpus</span>
            <span>Profile #042 · Decoding 47%</span>
          </div>

          {/* Top nav */}
          <nav className="hero-nav">
            <span className="hero-mark-row">
              <XenoMark size={42} />
              <span className="word"><span className="light">xeno</span>linguist</span>
            </span>
            <span className="privacy-chip">
              <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
              Ollama · Local-only
            </span>
            <div className="links">
              <a href="#method">Method</a>
              <a href="#proof">Proof</a>
              <a href="#privacy">Privacy</a>
              <a href="#open">Open source</a>
            </div>
            <Link to="/app" className="btn-hero primary" style={{ padding: '8px 14px', fontSize: 13 }}>
              Open workbench →
            </Link>
          </nav>

          {/* Centerpiece (row 1 spacer / row 2 center / row 3 meta) */}
          <div />
          <div className="hero-center">
            <h1 className="hero-headline float-up">
              Decode<br />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.18em' }}>
                <span className="indent-2">the</span><em>unknown.</em>
              </span>
            </h1>
            {/* DecodeMoment animation + sub copy + CTA row arrive in Task 28 */}
          </div>

          <div className="hero-meta">
            <span className="dot-row">
              <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
              <span>v0.7.2 — Eridian engine</span>
            </span>
            <span style={{ color: 'var(--fg-faint)' }}>·</span>
            <span>Built for conlangers, sci-fi worldbuilders, linguistics nerds</span>
            <span style={{ flex: 1 }} />
            <span>scroll ↓</span>
          </div>
        </section>

        <div className="scroll-veil" />

        {/* Below-fold sections (phases ribbon, mini-decoder, features, privacy,
            final CTA, footer) land in Tasks 29–30. Spacer keeps the topology
            backdrop visible on scroll until then. */}
        <div style={{ minHeight: '50vh' }} />
      </div>
    </>
  )
}
