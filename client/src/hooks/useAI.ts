import { useState, useCallback } from 'react'
import { streamAI } from '@/services/api'
import { useSessionLog } from '@/stores/session-log-context'
import { useOllama } from '@/stores/ollama-context'
import { SYSTEM_PROMPTS } from 'shared/prompts'
import type { AITask } from 'shared/types'

export function useAI() {
  const [loading, setLoading] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { addEntry } = useSessionLog()
  const { connected, getModelForTask } = useOllama()

  const runTask = useCallback(async (
    task: AITask,
    userMessage: string,
    options?: { onToken?: (token: string) => void; model?: string }
  ): Promise<string> => {
    if (!connected) {
      setError('Ollama is not connected')
      addEntry('error', 'AI request failed: Ollama not connected')
      throw new Error('Ollama not connected')
    }

    const model = options?.model || getModelForTask(task)
    setLoading(true)
    setStreamedText('')
    setError(null)
    addEntry('ai', `AI analysis started: ${task} (${model.split(':')[0]})`)

    let fullText = ''
    try {
      await streamAI(
        [{ role: 'user', content: userMessage }],
        {
          system: SYSTEM_PROMPTS[task],
          model,
        },
        (token) => {
          fullText += token
          setStreamedText(fullText)
          options?.onToken?.(token)
        }
      )
      addEntry('ai', `AI analysis complete: ${task}`)
      return fullText
    } catch (err) {
      const msg = (err as Error).message
      setError(msg)
      addEntry('error', `AI error: ${msg}`)
      throw err
    } finally {
      setLoading(false)
    }
  }, [connected, getModelForTask, addEntry])

  return { runTask, loading, streamedText, error }
}
