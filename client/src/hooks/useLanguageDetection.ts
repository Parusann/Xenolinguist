import { useState, useCallback } from 'react'
import { transcribe } from '@/services/stt'
import type { SttSegment } from 'shared/types'

export interface DetectionResult {
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
      const confidence = stt.languageProb
      computed = { language: stt.language || 'unknown', confidence, transcript: stt.text, mode: stt.mode, segments: stt.segments }
      setResult(computed)
    }
    setDetecting(false)
    return computed
  }, [])

  const reset = useCallback(() => { setResult(null); setDetecting(false) }, [])
  return { detect, detecting, result, reset }
}
