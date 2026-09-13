import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { AITask } from 'shared/types'
import type { ModelInventory } from 'shared/schemas/capabilities'

interface OllamaContextValue {
  connected: boolean; ready: boolean; models: string[]; inventory: ModelInventory | null
  selectedModel: string; setSelectedModel: (model: string) => void
  getModelForTask: (task: AITask) => string; refresh: () => Promise<void>
}
const OllamaContext = createContext<OllamaContextValue | null>(null)
export function OllamaProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ModelInventory | null>(null)
  const [selectedModel, setSelectedModel] = useState('')
  const refresh = useCallback(async () => {
    setStatus(previous => previous && Date.parse(previous.expiresAt) <= Date.now() ? { ...previous, ready: false } : previous)
    try {
      const response = await fetch('/api/ollama/status', { signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw Error()
      const data: ModelInventory = await response.json()
      if (!Array.isArray(data.models)) throw Error()
      setStatus(data)
      setSelectedModel(prev => data.models.includes(prev) ? prev : data.models.includes(data.defaultModel) ? data.defaultModel : data.models[0] ?? '')
    } catch { setStatus(null); setSelectedModel('') }
  }, [])
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer) }, [refresh])
  // Use one selected model for every task until a separate light-model benefit is evaluated.
  const getModelForTask = useCallback(() => selectedModel, [selectedModel])
  return <OllamaContext.Provider value={{ connected: status?.connected ?? false, ready: !!status?.ready && !!selectedModel, models: status?.models ?? [], inventory: status, selectedModel, setSelectedModel, getModelForTask, refresh }}>{children}</OllamaContext.Provider>
}
export function useOllama() { const ctx = useContext(OllamaContext); if (!ctx) throw Error('useOllama must be used within OllamaProvider'); return ctx }
