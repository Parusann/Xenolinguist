import { useState, useCallback } from 'react'
import { WaveformCanvas } from './WaveformCanvas'
import { AudioPlayer } from './AudioPlayer'

interface Segment {
  id: string
  start: number // normalized 0-1
  end: number   // normalized 0-1
  label: string
}

interface AudioSegmenterProps {
  src: string
  peaks: number[]
  duration: number
  initialSegments?: Segment[]
  onSegmentsChange: (segments: { id: string; start: number; end: number; label: string }[]) => void
  className?: string
}

let segIdCounter = 0

export function AudioSegmenter({
  src,
  peaks,
  duration,
  initialSegments = [],
  onSegmentsChange,
  className = '',
}: AudioSegmenterProps) {
  const [segments, setSegments] = useState<Segment[]>(initialSegments)
  const [mode, setMode] = useState<'listen' | 'mark'>('listen')
  const [markStart, setMarkStart] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const updateSegments = useCallback((newSegs: Segment[]) => {
    setSegments(newSegs)
    // Convert from normalized to seconds for parent
    onSegmentsChange(newSegs.map(s => ({
      id: s.id,
      start: s.start * duration,
      end: s.end * duration,
      label: s.label,
    })))
  }, [duration, onSegmentsChange])

  const handleWaveformClick = useCallback((pos: number) => {
    if (mode !== 'mark') return

    if (markStart === null) {
      setMarkStart(pos)
    } else {
      const start = Math.min(markStart, pos)
      const end = Math.max(markStart, pos)
      if (end - start < 0.01) {
        setMarkStart(null)
        return
      }
      const newSeg: Segment = {
        id: `seg-${Date.now()}-${++segIdCounter}`,
        start,
        end,
        label: '',
      }
      const newSegs = [...segments, newSeg].sort((a, b) => a.start - b.start)
      updateSegments(newSegs)
      setEditingId(newSeg.id)
      setMarkStart(null)
    }
  }, [mode, markStart, segments, updateSegments])

  const handleLabelChange = useCallback((id: string, label: string) => {
    const newSegs = segments.map(s => s.id === id ? { ...s, label } : s)
    updateSegments(newSegs)
  }, [segments, updateSegments])

  const handleRemoveSegment = useCallback((id: string) => {
    updateSegments(segments.filter(s => s.id !== id))
    if (editingId === id) setEditingId(null)
  }, [segments, updateSegments, editingId])

  const waveformSegments = segments.map(s => ({
    start: s.start,
    end: s.end,
    label: s.label,
    color: editingId === s.id ? 'rgba(0, 230, 118, 0.12)' : undefined,
  }))

  // Add the in-progress mark
  if (markStart !== null) {
    waveformSegments.push({
      start: markStart,
      end: markStart + 0.005,
      label: '▼',
      color: 'rgba(0, 230, 118, 0.2)',
    })
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Player with segments */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Audio Segmenter</label>
          <div className="flex gap-1 glass-inner rounded-lg overflow-hidden border border-white/[0.04]">
            <button
              onClick={() => { setMode('listen'); setMarkStart(null) }}
              className={`px-3 py-1 text-xs transition-all ${mode === 'listen' ? 'bg-accent/10 text-accent' : 'text-gray-500'}`}
            >
              Listen
            </button>
            <button
              onClick={() => setMode('mark')}
              className={`px-3 py-1 text-xs transition-all ${mode === 'mark' ? 'bg-accent/10 text-accent' : 'text-gray-500'}`}
            >
              Mark Words
            </button>
          </div>
        </div>

        {mode === 'mark' && (
          <p className="text-[11px] text-gray-600 mb-3">
            {markStart === null
              ? 'Click the waveform to set the start of a word boundary.'
              : 'Click again to set the end boundary.'}
          </p>
        )}

        <AudioPlayer
          src={src}
          peaks={peaks}
          duration={duration}
          segments={segments.map(s => ({
            start: s.start * duration,
            end: s.end * duration,
            label: s.label,
          }))}
        />

        {mode === 'mark' && (
          <div className="mt-3">
            <WaveformCanvas
              peaks={peaks}
              progress={null}
              segments={waveformSegments}
              onSeek={handleWaveformClick}
              height={50}
            />
          </div>
        )}
      </div>

      {/* Segments list */}
      {segments.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <label className="label mb-3">Word Segments · {segments.length}</label>
          <div className="space-y-2">
            {segments.map((seg, i) => (
              <div
                key={seg.id}
                className={`glass-inner rounded-lg p-3 flex items-center gap-3 border transition-all ${
                  editingId === seg.id ? 'border-accent/20' : 'border-white/[0.03]'
                }`}
              >
                <span className="text-[10px] font-mono text-gray-600 w-6">{i + 1}</span>
                <span className="text-[10px] font-mono text-gray-500">
                  {(seg.start * duration).toFixed(2)}s - {(seg.end * duration).toFixed(2)}s
                </span>
                <input
                  type="text"
                  value={seg.label}
                  onChange={(e) => handleLabelChange(seg.id, e.target.value)}
                  onFocus={() => setEditingId(seg.id)}
                  placeholder="Label this word..."
                  className="input flex-1 text-xs py-1"
                />
                <button
                  onClick={() => handleRemoveSegment(seg.id)}
                  className="text-xs text-gray-700 hover:text-red-400 transition-colors"
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
