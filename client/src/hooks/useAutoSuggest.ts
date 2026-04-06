import { useCallback, useRef } from 'react'
import { useAI } from './useAI'
import { useOllama } from '@/stores/ollama-context'
import { formatDictionaryForPrompt } from 'shared/prompts'
import type { DictionaryEntry } from 'shared/types'

/**
 * Hook that triggers AI pattern analysis when a new sample is added.
 * Uses the light model for quick suggestions. Debounced to avoid spam.
 */
export function useAutoSuggest() {
  const { runTask, loading } = useAI()
  const { connected } = useOllama()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const suggestForSample = useCallback(async (
    alienText: string,
    dictionary: DictionaryEntry[],
    onResult: (result: string) => void
  ) => {
    if (!connected || !alienText.trim() || dictionary.length === 0) return

    // Debounce — wait 1.5s after last call
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const prompt = `Current dictionary:\n${formatDictionaryForPrompt(dictionary)}\n\nNew sample just added:\n"${alienText}"\n\nQuickly identify any words from the dictionary that appear in this sample. For unknown words, suggest possible meanings based on their position and context. Be very concise — 2-3 lines max.`
        const result = await runTask('quickSuggest', prompt)
        onResult(result)
      } catch {
        // Silently fail — this is a background suggestion
      }
    }, 1500)
  }, [connected, runTask])

  return { suggestForSample, loading }
}
