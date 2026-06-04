import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
// @ts-expect-error - p5 ships no bundled type declarations
import p5 from 'p5'
// @ts-expect-error - vanta ships no type declarations
import TopologyImport from 'vanta/dist/vanta.topology.min'

interface VantaEffect {
  destroy: () => void
}

type VantaFactory = (opts: Record<string, unknown>) => VantaEffect

/**
 * Resolve the TOPOLOGY effect factory across module-interop shapes.
 *
 * The `vanta.topology.min` UMD bundle (`module.exports = factory()`) does not
 * expose the effect as a callable default export under Vite's ESM interop — the
 * import yields a non-function, so calling it throws "TOPOLOGY is not a function".
 * The effect IS reliably registered on `window.VANTA.TOPOLOGY` as an import
 * side-effect, so fall back to that. Handles all three shapes we might see:
 * a direct function, a `{ default: fn }` wrapper, or the window global.
 */
function resolveTopology(): VantaFactory | undefined {
  const imported = TopologyImport as unknown
  if (typeof imported === 'function') return imported as VantaFactory
  const viaDefault = (imported as { default?: unknown } | null | undefined)?.default
  if (typeof viaDefault === 'function') return viaDefault as VantaFactory
  const viaGlobal = (window as unknown as { VANTA?: { TOPOLOGY?: unknown } }).VANTA?.TOPOLOGY
  if (typeof viaGlobal === 'function') return viaGlobal as VantaFactory
  return undefined
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
      // Vanta's p5-based effects look up p5 on window; expose it before init.
      const w = window as unknown as { p5?: unknown }
      if (!w.p5) w.p5 = p5
      const TOPOLOGY = resolveTopology()
      if (!TOPOLOGY) throw new Error('VANTA.TOPOLOGY unavailable (bundle did not register)')
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
      })
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
