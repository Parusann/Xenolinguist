import { useEffect, useLayoutEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

export interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Adjust position if near screen edge. useLayoutEffect so the clamp happens before the
  // browser paints — otherwise the menu flashes at the unadjusted position for one frame.
  const adjustedPos = useRef({ x, y })
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let ax = x
    let ay = y
    if (x + rect.width > window.innerWidth - 8) {
      ax = window.innerWidth - rect.width - 8
    }
    if (y + rect.height > window.innerHeight - 8) {
      ay = window.innerHeight - rect.height - 8
    }
    adjustedPos.current = { x: ax, y: ay }
    el.style.left = `${ax}px`
    el.style.top = `${ay}px`
  }, [x, y])

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 glass rounded-xl shadow-lg border border-white/[0.06] py-1.5 min-w-[180px] animate-scale-pop"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => {
        if (item.label === '---') {
          return <div key={i} className="separator my-1 mx-2 h-px bg-white/[0.06]" />
        }
        return (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors ${
              item.disabled
                ? 'text-gray-700 cursor-not-allowed'
                : item.danger
                  ? 'text-gray-300 hover:text-red-400 hover:bg-white/[0.04]'
                  : 'text-gray-300 hover:text-gray-100 hover:bg-white/[0.04]'
            }`}
          >
            {item.icon && <span className="w-4 text-center text-sm">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-gray-600 font-mono ml-4">{item.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
