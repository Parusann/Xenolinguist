import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
// @ts-expect-error - p5 ships no bundled type declarations
import p5 from 'p5'
// @ts-expect-error - vanta ships no type declarations
import TOPOLOGY from 'vanta/dist/vanta.topology.min'

interface VantaEffect {
  destroy: () => void
}

/**
 * VantaTopology — ambient green-strand topology backdrop (Vanta.js + p5),
 * bundled rather than CDN so the app still runs offline. Reused on the
 * workbench landing and the marketing hero. Mount absolutely-positioned.
 *
 * The init is fully fail-safe: an ambient backdrop must never crash the app,
 * so any Vanta/p5 failure degrades to a plain (transparent) div.
 */
export function VantaTopology({ opacity = 0.85, style }: { opacity?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const effect = useRef<VantaEffect | null>(null)

  useEffect(() => {
    if (!ref.current || effect.current) return
    try {
      // Some Vanta builds look up p5 on window in addition to the option.
      const w = window as unknown as { p5?: unknown }
      if (!w.p5) w.p5 = p5
      effect.current = TOPOLOGY({
        el: ref.current,
        p5,
        mouseControls: false,
        touchControls: false,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        scale: 1,
        scaleMobile: 1,
        backgroundColor: 0x06090a,
        color: 0x2eb86b,
      }) as VantaEffect
    } catch (err) {
      // Degrade gracefully — the page still renders without the backdrop.
      console.warn('VantaTopology init failed; continuing without backdrop:', err)
      effect.current = null
    }
    return () => {
      try {
        effect.current?.destroy()
      } catch {
        /* canvas may already be gone */
      }
      effect.current = null
    }
  }, [])

  const vars = { '--vanta-op': String(opacity) } as CSSProperties
  return <div ref={ref} className="vanta-bg" style={{ position: 'absolute', inset: 0, ...vars, ...style }} />
}
