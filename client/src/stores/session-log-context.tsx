import { createContext, useContext, useCallback, useState, type ReactNode } from 'react'
import type { SessionLogEntry, LogEntryType } from 'shared/types'

interface SessionLogContextValue {
  entries: SessionLogEntry[]
  addEntry: (type: LogEntryType, message: string, metadata?: Record<string, unknown>) => void
  clearLog: () => void
}

const SessionLogContext = createContext<SessionLogContextValue | null>(null)

let entryCounter = 0

export function SessionLogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<SessionLogEntry[]>([])

  const addEntry = useCallback((type: LogEntryType, message: string, metadata?: Record<string, unknown>) => {
    const entry: SessionLogEntry = {
      id: `log-${++entryCounter}`,
      timestamp: new Date().toISOString(),
      type,
      message,
      metadata,
    }
    setEntries(prev => [...prev, entry])
  }, [])

  const clearLog = useCallback(() => setEntries([]), [])

  return (
    <SessionLogContext.Provider value={{ entries, addEntry, clearLog }}>
      {children}
    </SessionLogContext.Provider>
  )
}

export function useSessionLog() {
  const ctx = useContext(SessionLogContext)
  if (!ctx) throw new Error('useSessionLog must be used within SessionLogProvider')
  return ctx
}
