import { useEffect, useRef } from 'react'
import { type RegisteredShortcut, formatShortcut } from '@/hooks/useKeyboardShortcuts'

interface ShortcutsHelpProps {
  shortcuts: RegisteredShortcut[]
  onClose: () => void
}

const CATEGORY_ORDER: RegisteredShortcut['category'][] = ['Navigation', 'Actions', 'Other']

export function ShortcutsHelp({ shortcuts, onClose }: ShortcutsHelpProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: shortcuts.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0, 0, 0, 0.6)' }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="glass-card rounded-xl p-6 w-full max-w-md shadow-2xl" style={{ boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 230, 118, 0.03)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="text-accent font-mono text-sm text-glow">?</span>
            <h2 className="text-sm font-medium text-gray-200">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-400 transition-colors text-xs font-mono"
          >
            ESC
          </button>
        </div>

        <div className="separator mb-4" />

        {/* Shortcut groups */}
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.category}>
              <span className="label">{group.category}</span>
              <div className="space-y-1">
                {group.items.map((shortcut, i) => (
                  <div
                    key={`${group.category}-${i}`}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="text-[12px] text-gray-400">{shortcut.description}</span>
                    <kbd className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono text-accent/80 bg-accent/[0.06] border border-accent/[0.12]">
                      {formatShortcut(shortcut)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="separator mt-4 mb-3" />

        <p className="text-[10px] text-gray-600 font-mono text-center">
          Shortcuts are disabled while typing in inputs
        </p>
      </div>
    </div>
  )
}
