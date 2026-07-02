import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { OllamaStatus, AITask } from 'shared/types'

// Model weight categories for multi-model routing
type ModelWeight = 'heavy' | 'light'

const TASK_WEIGHTS: Record<AITask, ModelWeight> = {
  patternAnalysis: 'heavy',
  grammarInference: 'heavy',
  translation: 'heavy',
  conlangGeneration: 'heavy',
  numberAnalysis: 'heavy',
  phoneticAnalysis: 'heavy',
  quickSuggest: 'light',
}

interface OllamaContextValue {
  connected: boolean
  models: string[]
  selectedModel: string
  setSelectedModel: (model: string) => void
  lightModel: string
  setLightModel: (model: string) => void
  getModelForTask: (task: AITask) => string
  refresh: () => Promise<void>
}

const OllamaContext = createContext<OllamaContextValue | null>(null)

function pickDefaultModel(models: string[], preference: 'heavy' | 'light'): string {
  // gemma4:e4b is the app's bundled/default model (pulled by the desktop installer) — prefer it.
  const gemma = models.find(m => m.includes('gemma4:e4b')) || models.find(m => m.includes('gemma4'))
  if (gemma) return gemma
  if (preference === 'heavy') {
    return models.find(m => m.includes('qwen3:32b'))
      || models.find(m => m.includes('qwen3:14b'))
      || models.find(m => m.includes('qwen3'))
      || models.find(m => m.includes('qwen'))
      || models[0] || ''
  }
  // Light model: prefer smaller models
  return models.find(m => m.includes('llama3.1:8b'))
    || models.find(m => m.includes('llama3'))
    || models.find(m => m.includes('qwen3:14b'))
    || models.find(m => m.includes('qwen3'))
    || models[0] || ''
}

export function OllamaProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OllamaStatus>({ connected: false, models: [] })
  const [selectedModel, setSelectedModel] = useState('')
  const [lightModel, setLightModel] = useState('')

  const refresh = useCallback(() => {
    return fetch('/api/ollama/status')
      .then(res => res.json())
      .then((data: OllamaStatus) => {
        setStatus(data)
        if (data.connected && data.models.length > 0) {
          setSelectedModel(prev => prev || pickDefaultModel(data.models, 'heavy'))
          // Only set light model if there are 2+ models available
          setLightModel(prev => prev || pickDefaultModel(data.models, 'light'))
        }
      })
      .catch(() => {
        setStatus({ connected: false, models: [] })
      })
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [refresh])

  // In the packaged app, the Electron main process emits ollama lifecycle events via the
  // preload bridge. Reflect them here (faster than waiting for the 30s poll).
  useEffect(() => {
    const xeno = (window as unknown as {
      xeno?: {
        onOllamaOffline?: (cb: () => void) => () => void
        onOllamaPullProgress?: (cb: (d: unknown) => void) => () => void
      }
    }).xeno
    if (!xeno) return
    const offOffline = xeno.onOllamaOffline?.(() => setStatus({ connected: false, models: [] }))
    const offPull = xeno.onOllamaPullProgress?.((d) => {
      const s = (d as { status?: string } | null)?.status
      if (s && /success|complete/i.test(s)) refresh() // model finished downloading → re-check
    })
    return () => { offOffline?.(); offPull?.() }
  }, [refresh])

  const getModelForTask = useCallback((task: AITask): string => {
    const weight = TASK_WEIGHTS[task]
    if (weight === 'light' && lightModel && lightModel !== selectedModel) {
      return lightModel
    }
    return selectedModel
  }, [selectedModel, lightModel])

  return (
    <OllamaContext.Provider value={{
      connected: status.connected,
      models: status.models,
      selectedModel,
      setSelectedModel,
      lightModel,
      setLightModel,
      getModelForTask,
      refresh,
    }}>
      {children}
    </OllamaContext.Provider>
  )
}

export function useOllama() {
  const ctx = useContext(OllamaContext)
  if (!ctx) throw new Error('useOllama must be used within OllamaProvider')
  return ctx
}
