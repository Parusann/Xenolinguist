import { createContext, useContext, type ReactNode } from 'react'
import { useUndoRedo, type UndoableAction } from '@/hooks/useUndoRedo'

interface UndoContextValue {
  pushAction: (action: UndoableAction) => void
  undo: () => void
  canUndo: boolean
  lastAction: UndoableAction | null
}

const UndoContext = createContext<UndoContextValue | null>(null)

export function UndoProvider({ children }: { children: ReactNode }) {
  const undoRedo = useUndoRedo()

  return (
    <UndoContext.Provider value={undoRedo}>
      {children}
    </UndoContext.Provider>
  )
}

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used within UndoProvider')
  return ctx
}
