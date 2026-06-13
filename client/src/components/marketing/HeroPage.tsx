import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { VantaTopology } from '@/components/common/VantaTopology'
import { HeroMark } from './HeroMark'
import { DecodeMoment } from './DecodeMoment'
import { PhasesSection, DemoSection, FeaturesSection, PrivacySection, FinalCTA, HeroFooter } from './sections'
import { DownloadSection } from './DownloadSection'
import { isPublicSite } from '@/lib/site'
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
 * Marketing hero page (route "/") — a 1:1 port of the designer prototype
 * (prototypes/hero/{Hero,Sections,HeroApp}.jsx + hero.css). Fixed nav, cinematic
 * image hero with the DecodeMoment animation, and below-fold sections, all over a
 * fixed Vanta topology backdrop that reads through the translucent lower sections.
 */
export function HeroPage() {
  const navigate = useNavigate()
  // Public site has no workbench (static host, needs the local server + Ollama),
  // so CTAs scroll to the download block instead of opening /app.
  const onPrimary = isPublicSite
    ? () => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })
    : () => navigate('/app')

  // The workbench locks the viewport; the hero needs to scroll. This class
  // (scoped in marketing.css) unlocks overflow only while the hero is mounted.
  useEffect(() => {
    document.documentElement.classList.add('marketing-active')
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
              <span className="ttl">Field Capture · 04.06.2026</span>
              <span>Eridian first-contact corpus</span>
              <span>Profile #042 · Decoding 47%</span>
            </div>

            {/* Top nav */}
            <nav className="hero-nav">
              <span className="hero-mark-row">
                <HeroMark size={22} />
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
              <button className="btn-hero primary" style={{ padding: '8px 14px', fontSize: 13 }} onClick={onPrimary}>
                Open workbench →
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
                <DecodeMoment speed={1} />
              </div>

              <p className="hero-sub float-up" style={{ animationDelay: '180ms' }}>
                A local-first workbench for translating <b>unknown languages</b> — from the first sample to the first sentence. Inspired by first-contact linguistics. Your data <b>never leaves your machine</b>.
              </p>

              <div className="hero-cta float-up" style={{ animationDelay: '260ms' }}>
                <button className="btn-hero primary" onClick={onPrimary}>
                  <span>Start decoding</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>→</span>
                </button>
                <button className="btn-hero" onClick={onPrimary}>
                  <span style={{ width: 14, height: 14, borderRadius: 7, border: '1.5px solid currentColor', display: 'grid', placeItems: 'center' }}>
                    <span style={{ width: 4, height: 4, borderRadius: 2, background: 'currentColor' }} />
                  </span>
                  <span>Try the sandbox</span>
                </button>
                <span style={{ color: 'var(--fg-mute)', fontFamily: 'var(--font-mono)', fontSize: 12, marginLeft: 8 }}>
                  no account · runs offline · MIT
                </span>
              </div>
            </div>

            <div className="hero-meta">
              <span className="dot-row">
                <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
                <span>v1.0.0 — Eridian engine</span>
              </span>
              <span style={{ color: 'var(--fg-faint)' }}>·</span>
              <span>Built for conlangers, sci-fi worldbuilders, linguistics nerds</span>
              <span style={{ flex: 1 }} />
              <span>scroll ↓</span>
            </div>
          </section>

          <div className="scroll-veil" />
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
