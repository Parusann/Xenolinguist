import { useState, useEffect, useRef, useCallback } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useSessionLog } from '@/stores/session-log-context'
import { useOllama } from '@/stores/ollama-context'
import { ProfileSetup } from './ProfileSetup'

interface ProfileIndex {
  id: string
  name: string
  created_at: string
  updated_at: string
}

/* ── Ambient Particle Field ─────────────────────────── */
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

    // Stars (background layer)
    const stars = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1 + 0.2,
      speed: Math.random() * 0.1 + 0.01,
      opacity: Math.random() * 0.5 + 0.05,
      pulse: Math.random() * Math.PI * 2,
    }))

    // Interactive particles (foreground, react to mouse)
    const particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 2 + 0.8,
      opacity: Math.random() * 0.4 + 0.1,
      hue: Math.random() > 0.7 ? 150 : 140, // slight hue variation
      pulse: Math.random() * Math.PI * 2,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw stars
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

      // Draw interactive particles
      const mx = mouse.current.x
      const my = mouse.current.y

      for (const p of particles) {
        // Mouse repulsion
        const dx = p.x - mx
        const dy = p.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 180) {
          const force = (180 - dist) / 180
          p.vx += (dx / dist) * force * 0.15
          p.vy += (dy / dist) * force * 0.15
        }

        // Damping
        p.vx *= 0.985
        p.vy *= 0.985

        // Drift
        p.vx += (Math.random() - 0.5) * 0.02
        p.vy += (Math.random() - 0.5) * 0.02

        p.x += p.vx
        p.y += p.vy
        p.pulse += 0.015

        // Wrap
        if (p.x < -10) p.x = canvas.width + 10
        if (p.x > canvas.width + 10) p.x = -10
        if (p.y < -10) p.y = canvas.height + 10
        if (p.y > canvas.height + 10) p.y = -10

        const glow = 0.6 + Math.sin(p.pulse) * 0.4
        ctx.globalAlpha = p.opacity * glow

        // Glow effect
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4)
        gradient.addColorStop(0, `hsla(${p.hue}, 100%, 65%, 0.6)`)
        gradient.addColorStop(0.5, `hsla(${p.hue}, 100%, 55%, 0.15)`)
        gradient.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`)
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2)
        ctx.fill()

        // Core
        ctx.globalAlpha = p.opacity * glow * 1.5
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, 1)`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw connection lines between nearby particles
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

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />
}

/* ── Landing Screen ─────────────────────────── */
export function LandingScreen() {
  const [profiles, setProfiles] = useState<ProfileIndex[]>([])
  const [showSetup, setShowSetup] = useState(false)
  const [setupMode, setSetupMode] = useState<'new' | 'sandbox'>('new')
  const [ready, setReady] = useState(false)
  const { loadProfile } = useProfile()
  const { addEntry } = useSessionLog()
  const { connected } = useOllama()

  useEffect(() => {
    fetch('/api/profiles').then(r => r.json()).then(setProfiles).catch(() => {})
    const t = setTimeout(() => setReady(true), 100)
    return () => clearTimeout(t)
  }, [])

  if (showSetup) {
    return <ProfileSetup mode={setupMode} onBack={() => setShowSetup(false)} />
  }

  return (
    <div className="h-screen relative overflow-hidden">
      <ParticleField />

      {/* Noise overlay for texture */}
      <div className="noise-overlay" />

      {/* Center content */}
      <div className={`relative z-10 h-full flex flex-col items-center justify-center transition-all duration-1000 ${ready ? 'opacity-100' : 'opacity-0 translate-y-4'}`}>
        <div className="max-w-2xl w-full px-8">

          {/* Logo */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl glass-popover border-glow animate-float mb-6 relative">
              <img src="/logo.svg" alt="XL" className="w-16 h-16 drop-shadow-[0_0_12px_rgba(0,230,118,0.4)]" />
              {/* Ambient ring pulse */}
              <div className="absolute inset-0 rounded-2xl border border-accent/20 animate-breathe" />
            </div>
            <h1 className="text-4xl font-light tracking-tight mb-2 text-chrome">
              Xeno<span className="font-semibold text-chrome-accent">linguist</span>
            </h1>
            <p className="text-sm text-gray-500 tracking-widest uppercase font-mono">
              Language Decoding Workbench
            </p>
            <div className="separator mt-6 mx-auto w-48" />
          </div>

          {/* Action cards */}
          <div className="grid grid-cols-2 gap-4 mb-10">
            <button
              onClick={() => { setSetupMode('new'); setShowSetup(true) }}
              className="glass-card group p-6 rounded-xl text-left relative overflow-hidden hover:border-accent/15 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-accent/5 to-transparent rounded-bl-full" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:shadow-[0_0_12px_rgba(0,230,118,0.15)] transition-shadow">
                    <span className="font-mono text-accent text-sm">+</span>
                  </div>
                  <h2 className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">New Language</h2>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Begin decoding an unknown language from scratch. Input samples, map words, decode grammar.
                </p>
              </div>
            </button>

            <button
              onClick={() => { setSetupMode('sandbox'); setShowSetup(true) }}
              className="glass-card group p-6 rounded-xl text-left relative overflow-hidden hover:border-accent/15 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-accent/5 to-transparent rounded-bl-full" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:shadow-[0_0_12px_rgba(0,230,118,0.15)] transition-shadow">
                    <span className="font-mono text-accent text-sm">&#9672;</span>
                  </div>
                  <h2 className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">Sandbox</h2>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  AI generates a language with hidden rules. Practice the decoding workflow step by step.
                </p>
              </div>
            </button>
          </div>

          {/* Saved profiles */}
          {profiles.length > 0 && (
            <div className="animate-fade-in-up" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="separator flex-1" />
                <span className="label mb-0 flex-shrink-0">Saved Profiles</span>
                <div className="separator flex-1" />
              </div>
              <div className="space-y-2">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { loadProfile(p.id); addEntry('info', `Loading profile: ${p.name}`) }}
                    className="w-full glass-card rounded-lg px-4 py-3 flex items-center justify-between text-left group hover:border-accent/10 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-accent/40 group-hover:bg-accent group-hover:shadow-[0_0_8px_rgba(0,230,118,0.4)] transition-all" />
                      <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 font-mono">{new Date(p.updated_at).toLocaleDateString()}</span>
                      <span className="text-accent/40 group-hover:text-accent text-xs transition-colors">&#8594;</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status footer */}
          <div className="mt-10 flex items-center justify-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent animate-breathe' : 'bg-red-400'}`} />
              <span className={connected ? 'text-gray-500' : 'text-red-400/60'}>
                {connected ? 'Ollama connected' : 'Ollama offline'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Founder credit — fixed bottom */}
      <div className="founder-credit">
        Created by Parusan Natheeswaran
      </div>
    </div>
  )
}
