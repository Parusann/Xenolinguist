import { useState, useCallback, useRef, useEffect } from 'react'
import { streamAI } from '@/services/api'
import { useSessionLog } from '@/stores/session-log-context'
import { useOllama } from '@/stores/ollama-context'
import { useProfile } from '@/stores/profile-context'
import { saveAIRecords } from '@/stores/ai-history'
import { SYSTEM_PROMPTS } from 'shared/prompts'
import type { AITask } from 'shared/types'
import type { AIRecord } from 'shared/schemas/ai-history'

export function useAI() {
  const [loading, setLoading] = useState(false), [streamedText, setStreamedText] = useState(''), [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const { addEntry } = useSessionLog(), { ready, getModelForTask } = useOllama(), { profile } = useProfile()
  useEffect(() => () => controllerRef.current?.abort(), [])
  const cancel = useCallback(() => controllerRef.current?.abort(), [])
  const runTask = useCallback(async (task: AITask, userMessage: string, options?: { onToken?: (token: string) => void; model?: string }): Promise<string> => {
    if (!ready) { setError('No verified local chat model is ready. Open Runtime & setup.'); throw Error('Local chat is not ready') }
    if (controllerRef.current) throw Error('This analysis is already running')
    const model = options?.model || getModelForTask(task), profileId = profile?.id
    const controller = new AbortController(); controllerRef.current = controller
    setLoading(true); setStreamedText(''); setError(null)
    addEntry('ai', 'AI analysis started: ' + task + ' (' + model + ')')
    let fullText = ''
    const record: AIRecord = { id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: new Date().toISOString(), model, task, state: 'partial' }
    let lastSaved = 0
    const persist = () => { if (profileId) saveAIRecords(profileId, [{ ...record, content: fullText }]) }
    try {
      await streamAI([{ role: 'user', content: userMessage }], { task, system: SYSTEM_PROMPTS[task], model, signal: controller.signal }, token => {
        fullText += token; setStreamedText(fullText); options?.onToken?.(token)
        if (Date.now() - lastSaved > 1000) { persist(); lastSaved = Date.now() }
      })
      record.state = 'complete'; addEntry('ai', 'AI analysis complete: ' + task); return fullText
    } catch (failure) {
      record.state = controller.signal.aborted ? 'cancelled' : 'failed'
      record.error = (controller.signal.aborted ? 'Analysis cancelled; partial output retained' : (failure as Error).message).slice(0, 500)
      setError(record.error); addEntry('error', record.error); throw failure
    } finally { persist(); setLoading(false); if (controllerRef.current === controller) controllerRef.current = null }
  }, [ready, getModelForTask, profile?.id, addEntry])
  return { runTask, cancel, loading, streamedText, error }
}
