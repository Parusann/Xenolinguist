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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/ollama/status')
      const data: OllamaStatus = await res.json()
      setStatus(data)
      if (data.connected && data.models.length > 0) {
        if (!selectedModel) setSelectedModel(pickDefaultModel(data.models, 'heavy'))
        if (!lightModel) {
          // Only set light model if there are 2+ models available
          const light = pickDefaultModel(data.models, 'light')
          setLightModel(light)
        }
      }
    } catch {
      setStatus({ connected: false, models: [] })
    }
  }, [selectedModel, lightModel])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
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
