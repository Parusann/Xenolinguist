import { useState, useRef, useCallback, useEffect } from 'react'
import { WaveformCanvas } from './WaveformCanvas'

interface AudioPlayerProps {
  /** Audio source URL (blob: or http:) */
  src: string
  /** Pre-computed waveform peaks */
  peaks: number[]
  /** Duration in seconds */
  duration: number
  /** Segments to display on waveform */
  segments?: { start: number; end: number; label: string }[]
  /** Called when playback position changes */
  onTimeUpdate?: (currentTime: number) => void
  /** Compact mode for inline use */
  compact?: boolean
  className?: string
}

export function AudioPlayer({
  src,
  peaks,
  duration,
  segments = [],
  onTimeUpdate,
  compact = false,
  className = '',
}: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const audio = new Audio(src)
    audioRef.current = audio

    audio.addEventListener('ended', () => {
      setPlaying(false)
      setProgress(0)
      setCurrentTime(0)
    })

    return () => {
      audio.pause()
      audio.src = ''
      cancelAnimationFrame(animRef.current)
    }
  }, [src])

  const updateProgress = useCallback(() => {
    const audio = audioRef.current
    if (!audio || audio.paused) return
    const p = audio.currentTime / (audio.duration || duration)
    setProgress(p)
    setCurrentTime(audio.currentTime)
    onTimeUpdate?.(audio.currentTime)
    animRef.current = requestAnimationFrame(updateProgress)
  }, [duration, onTimeUpdate])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (playing) {
      audio.pause()
      cancelAnimationFrame(animRef.current)
      setPlaying(false)
    } else {
      audio.play()
      setPlaying(true)
      updateProgress()
    }
  }, [playing, updateProgress])

  const handleSeek = useCallback((pos: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = pos * (audio.duration || duration)
    setProgress(pos)
    setCurrentTime(audio.currentTime)
  }, [duration])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // Convert segments from seconds to normalized positions
  const normalizedSegments = segments.map(s => ({
    start: s.start / duration,
    end: s.end / duration,
    label: s.label,
  }))

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={togglePlay}
          className="w-6 h-6 rounded-full glass-inner border border-white/[0.06] flex items-center justify-center text-accent text-[10px] hover:border-accent/30 transition-all flex-shrink-0"
        >
          {playing ? '■' : '▶'}
        </button>
        <div className="flex-1 min-w-0">
          <WaveformCanvas
            peaks={peaks}
            progress={progress}
            segments={normalizedSegments}
            onSeek={handleSeek}
            height={24}
          />
        </div>
        <span className="text-[10px] font-mono text-gray-600 flex-shrink-0">
          {formatTime(currentTime)}
        </span>
      </div>
    )
  }

  return (
    <div className={`glass-card rounded-xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full glass-inner border border-white/[0.06] flex items-center justify-center text-accent text-xs hover:border-accent/30 transition-all"
          >
            {playing ? '■' : '▶'}
          </button>
          <div>
            <span className="text-xs font-mono text-gray-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
        {playing && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[10px] text-accent font-mono">Playing</span>
          </div>
        )}
      </div>

      <WaveformCanvas
        peaks={peaks}
        progress={progress}
        segments={normalizedSegments}
        onSeek={handleSeek}
        height={70}
      />
    </div>
  )
}
