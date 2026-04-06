import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  createdAt: number
  duration: number
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (message: string, type: ToastType, duration?: number) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX_TOASTS = 5

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((message: string, type: ToastType, duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const toast: Toast = { id, message, type, createdAt: Date.now(), duration }

    setToasts(prev => {
      const next = [...prev, toast]
      // Enforce max visible toasts — dismiss oldest first
      while (next.length > MAX_TOASTS) {
        const oldest = next.shift()!
        const timer = timersRef.current.get(oldest.id)
        if (timer) {
          clearTimeout(timer)
          timersRef.current.delete(oldest.id)
        }
      }
      return next
    })

    // Auto-dismiss after duration
    const timer = setTimeout(() => {
      timersRef.current.delete(id)
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
    timersRef.current.set(id, timer)
  }, [])

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach(t => clearTimeout(t))
      timers.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
