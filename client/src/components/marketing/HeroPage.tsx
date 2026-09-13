import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { VantaTopology } from '@/components/common/VantaTopology'
import { HeroMark } from './HeroMark'
import { DecodeMoment } from './DecodeMoment'
import { PhasesSection, DemoSection, FeaturesSection, PrivacySection, FinalCTA, HeroFooter } from './sections'
import { DownloadSection } from './DownloadSection'
import { isPublicSite, PRIMARY_LABEL, SOURCE_REVISION } from '@/lib/site'
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

/** Shared marketing page; public and desktop actions have distinct destinations. */
export function HeroPage() {
  const navigate = useNavigate()
  // Public site has no workbench (static host; the app needs the local server),
  // so CTAs scroll to the download block instead of opening /app.
  const onPrimary = isPublicSite
    ? () => document.getElementById('download')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    : () => navigate('/app')

  // The workbench locks the viewport; the hero needs to scroll. This class
  // (scoped in marketing.css) unlocks overflow only while the hero is mounted.
  useEffect(() => {
    document.documentElement.classList.add('marketing-active')
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
    return () => document.documentElement.classList.remove('marketing-active')
  }, [])

  return (
    <>
      {/* Topology backdrop — fixed behind everything (the hero image covers it,
          and it reads through the translucent sections below the fold). */}
      <VantaTopology opacity={0.85} style={{ position: 'fixed', zIndex: 0 }} />

      <div className="hero-page" style={{ position: 'relative', minHeight: '100vh' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* ── Hero section ── */}
          <section className="hero-stage">
            <div className="hero-bg-image" />
            <HeroReticle />

            {/* Corner caption */}
            <div className="hero-caption">
              <span className="ln" />
              <span className="ttl">Fictional first-contact scene</span>
              <span>Eridian teaching corpus</span>
              <span>Illustration · no measured decoding score</span>
            </div>

            {/* Top nav */}
            <nav className="hero-nav">
              <span className="hero-mark-row">
                <HeroMark size={22} />
                <span className="word"><span className="light">xeno</span>linguist</span>
              </span>
              <span className="privacy-chip">
                <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
                Local workbench
              </span>
              <div className="links">
                <a href="#method">Method</a>
                <a href="#proof">Dictionary demo</a>
                <a href="#privacy">Privacy</a>
                <a href="#open">Source & license</a>
              </div>
              <button className="btn-hero primary" style={{ padding: '8px 14px', fontSize: 13 }} onClick={onPrimary}>
                {PRIMARY_LABEL} →
              </button>
            </nav>

            {/* Centerpiece */}
            <div />
            <div className="hero-center">
              <h1 className="hero-headline float-up">
                Decode<br />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.18em' }}>
                  <span className="indent-2">the</span><em>unknown.</em>
                </span>
              </h1>

              <div style={{ marginTop: 56, width: '100%' }}>
                <DecodeMoment />
              </div>

              <p className="hero-sub float-up" style={{ animationDelay: '180ms' }}>
                A local workbench for <b>constructed-language exploration</b>. Collect samples, build a dictionary, record grammar ideas and review model suggestions. A tool for investigation, with explicit limits on what it can infer.
              </p>

              <div className="hero-cta float-up" style={{ animationDelay: '260ms' }}>
                <button className="btn-hero primary" onClick={onPrimary}>
                  <span>{PRIMARY_LABEL}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>→</span>
                </button>
                <a className="btn-hero" href="#proof">
                  <span style={{ width: 14, height: 14, borderRadius: 7, border: '1.5px solid currentColor', display: 'grid', placeItems: 'center' }}>
                    <span style={{ width: 4, height: 4, borderRadius: 2, background: 'currentColor' }} />
                  </span>
                  <span>Try dictionary demo</span>
                </a>
                <span style={{ color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)', fontSize: 12, marginLeft: 8 }}>
                  no account · offline after setup · proprietary
                </span>
              </div>
            </div>

            <div className="hero-meta">
              <span className="dot-row">
                <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
                <span>Development preview · source {SOURCE_REVISION}</span>
              </span>
              <span style={{ color: 'var(--fg-faint)' }}>·</span>
              <span>Built for conlangers, sci-fi worldbuilders, linguistics nerds</span>
              <span style={{ flex: 1 }} />
              <span>scroll ↓</span>
            </div>
          </section>

          <div className="scroll-veil" />
          <section className="section release-context" aria-label="Version status"><p>This page describes the implementation preview. The published v1.0.0 installer predates the reliability improvements shown here. See download details before installing.</p></section>
          <PhasesSection />
          <DemoSection />
          <FeaturesSection />
          <PrivacySection />
          {isPublicSite && <DownloadSection />}
          <FinalCTA onEnterApp={onPrimary} />
          <HeroFooter />
        </div>
      </div>
    </>
  )
}
