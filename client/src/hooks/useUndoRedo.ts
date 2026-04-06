import { useState, useCallback } from 'react'

export interface UndoableAction {
  description: string
  undo: () => void
}

const MAX_STACK = 20

export function useUndoRedo() {
  const [stack, setStack] = useState<UndoableAction[]>([])

  const pushAction = useCallback((action: UndoableAction) => {
    setStack(prev => {
      const next = [...prev, action]
      if (next.length > MAX_STACK) next.shift()
      return next
    })
  }, [])

  const undo = useCallback(() => {
    setStack(prev => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const action = next.pop()!
      action.undo()
      return next
    })
  }, [])

  const canUndo = stack.length > 0
  const lastAction = stack.length > 0 ? stack[stack.length - 1] : null

  return { pushAction, undo, canUndo, lastAction }
}
