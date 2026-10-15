import { useEffect, useRef, type CSSProperties } from 'react'

/** Ambient contour field drawn with Canvas 2D, compatible with a no-eval CSP. */
export function VantaTopology({ opacity = 0.85, style }: { opacity?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current, context = canvas?.getContext('2d')
    if (!canvas || !context) return
    let frame = 0
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const resize = () => { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight }
    const draw = (time: number) => {
      const { width, height } = canvas
      context.clearRect(0, 0, width, height)
      context.strokeStyle = 'rgba(46,184,107,0.12)'; context.lineWidth = 0.7
      const phase = reducedMotion.matches ? 0 : time / 18000
      for (let row = -5; row < 45; row++) {
        context.beginPath()
        for (let x = 0; x <= width; x += 14) {
          const y = row * height / 36 + Math.sin(x / 210 + phase + row / 7) * 42 + Math.sin(x / 97 - row / 9) * 14
          if (x === 0) context.moveTo(x, y); else context.lineTo(x, y)
        }
        context.stroke()
      }
      if (!reducedMotion.matches) frame = requestAnimationFrame(draw)
    }
    const observer = new ResizeObserver(() => { resize(); if (reducedMotion.matches) draw(0) })
    observer.observe(canvas); resize(); draw(0)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [])
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity, ...style }} />
}
