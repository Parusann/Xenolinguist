import { useState, useCallback } from 'react'
import { transcribe } from '@/services/stt'
import type { SttSegment } from 'shared/types'

interface DetectionResult {
  language: string
  confidence: number
  transcript: string
  mode: 'transcription' | 'phonetic-guess'
  segments: SttSegment[]
}

export function useLanguageDetection() {
  const [detecting, setDetecting] = useState(false)
  const [result, setResult] = useState<DetectionResult | null>(null)

  const detect = useCallback(async (blob: Blob): Promise<DetectionResult | null> => {
    setDetecting(true)
    setResult(null)
    const stt = await transcribe(blob)
    let computed: DetectionResult | null = null
    if (stt) {
      const confidence = stt.segments.length
        ? stt.segments.reduce((a, s) => a + s.avgProb, 0) / stt.segments.length
        : stt.languageProb
      computed = { language: stt.language || 'unknown', confidence, transcript: stt.text, mode: stt.mode, segments: stt.segments }
      setResult(computed)
    }
    setDetecting(false)
    return computed
  }, [])

  const reset = useCallback(() => { setResult(null); setDetecting(false) }, [])
  return { detect, detecting, result, reset }
}

/** Compact display component for detected language */
export function LanguageBadge({ result, detecting }: {
  result: DetectionResult | null
  detecting: boolean
}) {
  if (detecting) {
    return (
      <div className="flex items-center gap-2 glass-inner rounded-lg px-3 py-1.5 border border-white/[0.04]">
        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span className="text-[11px] font-mono text-gray-400">Detecting language...</span>
      </div>
    )
  }

  if (!result) return null

  const isGuess = result.mode === 'phonetic-guess'
  const confidenceColor = isGuess ? 'text-amber-400' : 'text-accent'

  return (
    <div className="glass-inner rounded-lg px-3 py-2 border border-white/[0.04] space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-gray-600">{isGuess ? 'PHONETIC GUESS' : 'TRANSCRIPTION'}</span>
        <span className={`text-xs font-medium ${confidenceColor}`}>{result.language}</span>
        <span className="badge badge-confirmed text-[10px]">{Math.round(result.confidence * 100)}%</span>
        {isGuess && <span className="text-[10px] font-mono text-amber-400/80">low confidence</span>}
      </div>
      {result.transcript && (
        <p className="text-[11px] font-mono text-gray-500 truncate">"{result.transcript}"</p>
      )}
    </div>
  )
}
