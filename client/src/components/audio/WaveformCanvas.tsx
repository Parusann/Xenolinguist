import { useRef, useEffect, useCallback } from 'react'

interface WaveformCanvasProps {
  /** Normalized peak values (0-1) for each bar */
  peaks: number[]
  /** Current playback progress 0-1, or null if not playing */
  progress: number | null
  /** Segments to highlight on the waveform */
  segments?: { start: number; end: number; label: string; color?: string }[]
  /** Called when user clicks a position on the waveform (0-1) */
  onSeek?: (position: number) => void
  /** Height in px */
  height?: number
  /** CSS class */
  className?: string
}

export function WaveformCanvas({
  peaks,
  progress,
  segments = [],
  onSeek,
  height = 80,
  className = '',
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || peaks.length === 0) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = height * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = height
    const barCount = peaks.length
    const barWidth = Math.max(1, (w / barCount) - 1)
    const gap = 1

    ctx.clearRect(0, 0, w, h)

    // Draw segments background
    for (const seg of segments) {
      const x1 = seg.start * w
      const x2 = seg.end * w
      ctx.fillStyle = seg.color || 'rgba(0, 230, 118, 0.06)'
      ctx.fillRect(x1, 0, x2 - x1, h)

      // Segment border
      ctx.strokeStyle = 'rgba(0, 230, 118, 0.15)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x1, 0)
      ctx.lineTo(x1, h)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x2, 0)
      ctx.lineTo(x2, h)
      ctx.stroke()

      // Label
      if (seg.label) {
        ctx.fillStyle = 'rgba(0, 230, 118, 0.5)'
        ctx.font = '9px "JetBrains Mono", monospace'
        ctx.textAlign = 'center'
        ctx.fillText(seg.label, (x1 + x2) / 2, 10)
      }
    }

    // Draw waveform bars
    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap)
      const peakVal = peaks[i]
      const barH = Math.max(2, peakVal * (h * 0.8))
      const y = (h - barH) / 2

      const barProgress = x / w
      if (progress !== null && barProgress <= progress) {
        ctx.fillStyle = 'rgba(0, 230, 118, 0.7)'
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
      }

      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barH, 1)
      ctx.fill()
    }

    // Playhead line
    if (progress !== null && progress > 0) {
      const px = progress * w
      ctx.strokeStyle = 'rgba(0, 230, 118, 0.8)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, h)
      ctx.stroke()

      // Playhead glow
      const grd = ctx.createRadialGradient(px, h / 2, 0, px, h / 2, 8)
      grd.addColorStop(0, 'rgba(0, 230, 118, 0.3)')
      grd.addColorStop(1, 'rgba(0, 230, 118, 0)')
      ctx.fillStyle = grd
      ctx.fillRect(px - 8, 0, 16, h)
    }
  }, [peaks, progress, segments, height])

  useEffect(() => {
    draw()
    const observer = new ResizeObserver(draw)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [draw])

  const handleClick = (e: React.MouseEvent) => {
    if (!onSeek || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    onSeek(Math.max(0, Math.min(1, pos)))
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${onSeek ? 'cursor-pointer' : ''} ${className}`}
      onClick={handleClick}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}

/** Extract normalized peaks from an AudioBuffer */
export function extractPeaks(audioBuffer: AudioBuffer, barCount: number = 200): number[] {
  const channelData = audioBuffer.getChannelData(0)
  const samplesPerBar = Math.floor(channelData.length / barCount)
  const peaks: number[] = []

  for (let i = 0; i < barCount; i++) {
    let max = 0
    const start = i * samplesPerBar
    for (let j = start; j < start + samplesPerBar && j < channelData.length; j++) {
      const abs = Math.abs(channelData[j])
      if (abs > max) max = abs
    }
    peaks.push(max)
  }

  // Normalize to 0-1
  const globalMax = Math.max(...peaks, 0.01)
  return peaks.map(p => p / globalMax)
}
