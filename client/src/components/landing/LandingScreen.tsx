import { useState, useEffect, useRef, useCallback } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useSessionLog } from '@/stores/session-log-context'
import { useOllama } from '@/stores/ollama-context'
import { ProfileSetup } from './ProfileSetup'
import { VantaTopology } from '@/components/common/VantaTopology'
import { XenoMark } from '@/components/common/XenoMark'
import { getDecodingProgress } from '@/lib/profileStats'
import { apiFetch } from '@/services/api'
import type { LanguageProfile, ProfileIndex } from 'shared/types'

/** A saved-profile row enriched with the live word count + decode% the mock shows. */
interface ProfileRow extends ProfileIndex {
  words: number
  decode: number
  active: boolean
}

/* ── Ambient Particle Field (signature — kept verbatim) ── */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({ x: -1000, y: -1000 })

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouse.current = { x: e.clientX, y: e.clientY }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let animId: number

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', handleMouseMove)

    const stars = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1 + 0.2,
      speed: Math.random() * 0.1 + 0.01,
      opacity: Math.random() * 0.5 + 0.05,
      pulse: Math.random() * Math.PI * 2,
    }))

    const particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 2 + 0.8,
      opacity: Math.random() * 0.4 + 0.1,
      hue: Math.random() > 0.7 ? 150 : 140,
      pulse: Math.random() * Math.PI * 2,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const star of stars) {
        star.pulse += 0.006
        const flicker = 0.5 + Math.sin(star.pulse) * 0.5
        ctx.globalAlpha = star.opacity * flicker
        ctx.fillStyle = star.opacity > 0.35 ? '#b0ffc8' : '#ffffff'
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
        ctx.fill()
        star.y -= star.speed
        if (star.y < -2) { star.y = canvas.height + 2; star.x = Math.random() * canvas.width }
      }

      const mx = mouse.current.x
      const my = mouse.current.y

      for (const p of particles) {
        const dx = p.x - mx
        const dy = p.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 180) {
          const force = (180 - dist) / 180
          p.vx += (dx / dist) * force * 0.15
          p.vy += (dy / dist) * force * 0.15
        }
        p.vx *= 0.985
        p.vy *= 0.985
        p.vx += (Math.random() - 0.5) * 0.02
        p.vy += (Math.random() - 0.5) * 0.02
        p.x += p.vx
        p.y += p.vy
        p.pulse += 0.015
        if (p.x < -10) p.x = canvas.width + 10
        if (p.x > canvas.width + 10) p.x = -10
        if (p.y < -10) p.y = canvas.height + 10
        if (p.y > canvas.height + 10) p.y = -10

        const glow = 0.6 + Math.sin(p.pulse) * 0.4
        ctx.globalAlpha = p.opacity * glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4)
        gradient.addColorStop(0, `hsla(${p.hue}, 100%, 65%, 0.6)`)
        gradient.addColorStop(0.5, `hsla(${p.hue}, 100%, 55%, 0.15)`)
        gradient.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`)
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2)
        ctx.fill()

        ctx.globalAlpha = p.opacity * glow * 1.5
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, 1)`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalAlpha = 0.06
      ctx.strokeStyle = '#00E676'
      ctx.lineWidth = 0.5
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.globalAlpha = 0.06 * (1 - dist / 120)
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }

      animId = requestAnimationFrame(draw)
    }
    animId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [handleMouseMove])

  return <canvas ref={canvasRef} className="stars" style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none' }} />
}

/* ── Landing Screen — mirrors the designer prototype Landing.jsx ── */
export function LandingScreen() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [showSetup, setShowSetup] = useState(false)
  const [setupMode, setSetupMode] = useState<'new' | 'sandbox'>('new')
  const [ready, setReady] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const { loadProfile } = useProfile()
  const { addEntry } = useSessionLog()
  const { connected } = useOllama()

  // Fetch the profile index, then hydrate each row with its live word count and
  // decode% via getDecodingProgress — the same source of truth the dashboard and
  // status bar use, so the numbers shown here always agree with the workbench.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const index = await apiFetch<ProfileIndex[]>('/profiles')
        const sorted = [...index].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
        const rows = await Promise.all(
          sorted.map(async (p, i): Promise<ProfileRow> => {
            try {
              const full = await apiFetch<LanguageProfile>(`/profiles/${p.id}`)
              return { ...p, words: full.dictionary.length, decode: getDecodingProgress(full), active: i === 0 }
            } catch {
              return { ...p, words: 0, decode: 0, active: i === 0 }
            }
          }),
        )
        if (!cancelled) setProfiles(rows)
      } catch {
        /* offline or no profiles yet — leave the list empty */
      }
    })()
    const t = setTimeout(() => setReady(true), 100)
    return () => { cancelled = true; clearTimeout(t) }
  }, [])

  if (showSetup) {
    return <ProfileSetup mode={setupMode} onBack={() => setShowSetup(false)} />
  }

  const openSetup = (mode: 'new' | 'sandbox') => { setSetupMode(mode); setShowSetup(true) }

  const loadDemo = async () => {
    setLoadingDemo(true)
    try {
      const created = await apiFetch<LanguageProfile>('/profiles/demo', { method: 'POST' })
      await loadProfile(created.id)
      addEntry('success', `Loaded demo language: ${created.name}`)
    } catch {
      setLoadingDemo(false)
    }
  }

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-deep)' }}>
      {/* Vanta topology backdrop — fail-safe; degrades to a plain div if Vanta can't init */}
      <VantaTopology opacity={0.95} style={{ zIndex: 1, pointerEvents: 'none' }} />

      <ParticleField />

      {/* Soft vignette + grid only — no opaque base, so the topology shows through */}
      <div
        className="app-bg show-grid"
        style={{
          zIndex: 2,
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0, 230, 118, 0.04), transparent 60%), radial-gradient(ellipse 60% 50% at 50% 100%, rgba(0, 230, 118, 0.025), transparent 60%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          height: '100%',
          display: 'grid',
          gridTemplateColumns: '1fr 520px 1fr',
          gridTemplateRows: '1fr auto 1fr',
          alignItems: 'center',
          transition: 'opacity 1s ease, transform 1s ease',
          opacity: ready ? 1 : 0,
          transform: ready ? 'none' : 'translateY(16px)',
        }}
      >
        {/* Center column */}
        <div style={{ gridColumn: '2', gridRow: '2', padding: '40px 0' }}>
          {/* Logo + wordmark */}
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
              <XenoMark size={56} />
            </div>
            <h1 className="h-display" style={{ margin: 0, fontSize: 56, letterSpacing: '-0.03em' }}>
              <span style={{ fontWeight: 200, opacity: 0.85 }}>xeno</span>
              <em>linguist</em>
            </h1>
            <div className="kicker" style={{ marginTop: 14, color: 'var(--fg-dim)' }}>
              <span>Language</span>{'  ·  '}<span>Decoding</span>{'  ·  '}<span>Workbench</span>
            </div>
            <div style={{ marginTop: 18, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-faint)', letterSpacing: '0.04em' }}>
              v1.0.0 · LOCAL ONLY · OLLAMA{' '}
              <span style={{ color: connected ? 'var(--accent)' : 'var(--conf-unknown)' }}>●</span>{' '}
              {connected ? 'CONNECTED' : 'OFFLINE'}
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 36 }}>
            <button
              className="glass-card"
              onClick={() => openSetup('new')}
              style={{ padding: 22, textAlign: 'left', cursor: 'pointer', color: 'var(--fg)', transition: 'transform 180ms ease, border-color 180ms ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,230,118,0.4)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', border: '1px solid rgba(0,230,118,0.35)', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 18 }}>+</div>
                <span className="kicker">01</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, marginBottom: 6 }}>New Language</div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-dim)', lineHeight: 1.5 }}>
                Begin decoding from zero. Capture samples, map numbers, build a dictionary, infer grammar.
              </div>
            </button>

            <button
              className="glass-card"
              onClick={() => openSetup('sandbox')}
              style={{ padding: 22, textAlign: 'left', cursor: 'pointer', color: 'var(--fg)', transition: 'transform 180ms ease, border-color 180ms ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(150,120,255,0.4)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--ai-soft)', border: '1px solid oklch(0.74 0.16 285 / 0.4)', color: 'var(--ai)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>◈</div>
                <span className="kicker">02</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, marginBottom: 6 }}>Sandbox</div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-dim)', lineHeight: 1.5 }}>
                AI generates a language with hidden rules. Practice the decoding workflow with an answer key.
              </div>
            </button>
          </div>

          {/* Load demo language — pre-seeded "Eridian" to explore the workflow */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <button
              onClick={loadDemo}
              disabled={loadingDemo}
              className="glass-inner"
              style={{
                padding: '10px 18px',
                cursor: loadingDemo ? 'default' : 'pointer',
                color: 'var(--accent)',
                borderColor: 'rgba(0,230,118,0.25)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12.5,
                opacity: loadingDemo ? 0.6 : 1,
              }}
              title="Create a pre-seeded demo language (Eridian) to explore the decoding workflow"
            >
              {loadingDemo ? 'Loading demo…' : '◇ Load demo language · Eridian'}
            </button>
          </div>

          {/* Saved profiles */}
          {profiles.length > 0 && (
            <div>
              <div className="kicker" style={{ textAlign: 'center', marginBottom: 14, color: 'var(--fg-mute)' }}>
                ─── Saved Profiles ───
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={async () => {
                      addEntry('info', `Loading profile: ${p.name}`)
                      try { await loadProfile(p.id) } catch { addEntry('error', `Failed to load ${p.name}`) }
                    }}
                    className="glass-inner"
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: p.active ? 'rgba(0,230,118,0.06)' : 'var(--bg-inner)',
                      borderColor: p.active ? 'rgba(0,230,118,0.25)' : 'var(--border)',
                      color: 'var(--fg)',
                      display: 'grid',
                      gridTemplateColumns: '12px 1fr 100px 70px 16px',
                      alignItems: 'center',
                      gap: 12,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12.5,
                    }}
                  >
                    <span className="dot" style={{ background: p.active ? 'var(--accent)' : 'var(--fg-faint)', boxShadow: p.active ? '0 0 8px var(--accent)' : 'none' }} />
                    <span style={{ color: p.active ? 'var(--fg)' : 'var(--fg-dim)' }}>{p.name}</span>
                    <span style={{ color: 'var(--fg-mute)', textAlign: 'right' }}>{p.words} words</span>
                    <div className="cbar confirmed" title={p.decode + '%'}><span style={{ width: p.decode + '%' }} /></div>
                    <span style={{ color: 'var(--fg-faint)', textAlign: 'right' }}>→</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="founder-credit">Created by Parusan Natheeswaran</div>
    </div>
  )
}
