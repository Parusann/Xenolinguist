import { useEffect, useState } from 'react'
import { useToast, type Toast } from '@/stores/toast-context'

const TYPE_COLORS: Record<string, { accent: string; glow: string }> = {
  success: { accent: '#00E676', glow: 'rgba(0,230,118,0.15)' },
  error:   { accent: '#f87171', glow: 'rgba(248,113,113,0.15)' },
  warning: { accent: '#fbbf24', glow: 'rgba(251,191,36,0.15)' },
  info:    { accent: '#9ca3af', glow: 'rgba(156,163,175,0.10)' },
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={removeToast} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: string) => void }) {
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(100)
  const colors = TYPE_COLORS[toast.type]

  // Animate progress bar drain
  useEffect(() => {
    const start = toast.createdAt
    const end = start + toast.duration
    let raf: number

    const tick = () => {
      const now = Date.now()
      const remaining = Math.max(0, (end - now) / toast.duration) * 100
      setProgress(remaining)
      if (remaining > 0) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [toast.createdAt, toast.duration])

  // Trigger exit animation slightly before removal
  useEffect(() => {
    const timeout = setTimeout(() => {
      setExiting(true)
    }, toast.duration - 300)
    return () => clearTimeout(timeout)
  }, [toast.duration])

  const handleClose = () => {
    setExiting(true)
    setTimeout(() => onClose(toast.id), 200)
  }

  return (
    <div
      className="pointer-events-auto"
      style={{
        animation: exiting
          ? 'toast-exit 0.2s ease-in forwards'
          : 'toast-enter 0.25s ease-out',
      }}
    >
      <div
        className="glass rounded-xl overflow-hidden relative min-w-[280px] max-w-[380px]"
        style={{
          boxShadow: `0 0 20px ${colors.glow}, 0 4px 12px rgba(0,0,0,0.4)`,
        }}
      >
        {/* Left accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
          style={{ backgroundColor: colors.accent }}
        />

        {/* Content */}
        <div className="flex items-start gap-2 pl-4 pr-2 py-3">
          <p className="text-gray-200 text-sm flex-1 leading-snug pt-0.5">{toast.message}</p>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-base leading-none px-1 flex-shrink-0"
            aria-label="Close toast"
          >
            &times;
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-[2px] w-full bg-white/[0.03]">
          <div
            className="h-full transition-none"
            style={{
              width: `${progress}%`,
              backgroundColor: colors.accent,
              opacity: 0.5,
            }}
          />
        </div>
      </div>
    </div>
  )
}
