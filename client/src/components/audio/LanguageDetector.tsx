import { useState, useCallback } from 'react'

interface DetectionResult {
  language: string
  confidence: number
  transcript: string
}

// Languages the Web Speech API commonly supports
const SPEECH_LANGUAGES = [
  { code: 'en-US', name: 'English' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese (Mandarin)' },
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'nl-NL', name: 'Dutch' },
  { code: 'sv-SE', name: 'Swedish' },
  { code: 'pl-PL', name: 'Polish' },
  { code: 'tr-TR', name: 'Turkish' },
]

/**
 * Tries to recognize speech from a blob using the Web Speech API.
 * Tests multiple languages and picks the one with the best result.
 */
async function detectWithSpeechAPI(blob: Blob): Promise<DetectionResult | null> {
  // Check if SpeechRecognition is available
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SpeechRecognition) return null

  const audioUrl = URL.createObjectURL(blob)

  // Try each language and collect results
  const results: DetectionResult[] = []

  // We can only test a few languages at a time to keep it fast
  const topLanguages = SPEECH_LANGUAGES.slice(0, 6)

  for (const lang of topLanguages) {
    try {
      const result = await new Promise<DetectionResult | null>((resolve) => {
        const recognition = new SpeechRecognition()
        recognition.lang = lang.code
        recognition.continuous = false
        recognition.interimResults = false
        recognition.maxAlternatives = 1

        const timeout = setTimeout(() => {
          recognition.abort()
          resolve(null)
        }, 5000)

        recognition.onresult = (event: any) => {
          clearTimeout(timeout)
          if (event.results.length > 0) {
            const result = event.results[0][0]
            resolve({
              language: lang.name,
              confidence: result.confidence,
              transcript: result.transcript,
            })
          } else {
            resolve(null)
          }
        }

        recognition.onerror = () => {
          clearTimeout(timeout)
          resolve(null)
        }

        recognition.onend = () => {
          clearTimeout(timeout)
        }

        recognition.start()
      })

      if (result && result.confidence > 0.3) {
        results.push(result)
      }
    } catch {
      // Skip this language
    }
  }

  URL.revokeObjectURL(audioUrl)

  if (results.length === 0) return null

  // Return the highest confidence match
  results.sort((a, b) => b.confidence - a.confidence)
  return results[0]
}

/**
 * Detect language using Ollama AI analysis of the transcript
 */
async function detectWithAI(transcript: string): Promise<DetectionResult | null> {
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a language identification expert. Given a text sample, identify the language. Respond with ONLY a JSON object: {"language": "English", "confidence": 0.95}. Nothing else.',
          },
          {
            role: 'user',
            content: `Identify the language of this text: "${transcript}"`,
          },
        ],
      }),
    })

    const data = await res.json()
    const jsonMatch = data.message?.content?.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        language: parsed.language,
        confidence: parsed.confidence || 0.8,
        transcript,
      }
    }
  } catch {
    // AI detection failed
  }
  return null
}

export function useLanguageDetection() {
  const [detecting, setDetecting] = useState(false)
  const [result, setResult] = useState<DetectionResult | null>(null)

  const detect = useCallback(async (blob: Blob) => {
    setDetecting(true)
    setResult(null)

    // Step 1: Try Web Speech API for real-time recognition
    const speechResult = await detectWithSpeechAPI(blob)

    if (speechResult) {
      setResult(speechResult)

      // Step 2: If we got a transcript but want more confidence, verify with AI
      if (speechResult.confidence < 0.7 && speechResult.transcript) {
        const aiResult = await detectWithAI(speechResult.transcript)
        if (aiResult && aiResult.confidence > speechResult.confidence) {
          setResult(aiResult)
        }
      }
    }

    setDetecting(false)
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setDetecting(false)
  }, [])

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

  const confidenceColor = result.confidence >= 0.7
    ? 'text-accent'
    : result.confidence >= 0.4
      ? 'text-amber-400'
      : 'text-gray-400'

  return (
    <div className="glass-inner rounded-lg px-3 py-2 border border-white/[0.04] space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-gray-600">DETECTED</span>
        <span className={`text-xs font-medium ${confidenceColor}`}>
          {result.language}
        </span>
        <span className="badge badge-confirmed text-[10px]">
          {Math.round(result.confidence * 100)}%
        </span>
      </div>
      {result.transcript && (
        <p className="text-[11px] font-mono text-gray-500 truncate">
          "{result.transcript}"
        </p>
      )}
    </div>
  )
}
