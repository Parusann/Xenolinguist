import { useEffect, useCallback, useMemo } from 'react'

export interface ShortcutDefinition {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  handler: () => void
  description: string
  category?: 'Navigation' | 'Actions' | 'Other'
}

export interface RegisteredShortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  description: string
  category: 'Navigation' | 'Actions' | 'Other'
}

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable) return true
  return false
}

function matchesShortcut(e: KeyboardEvent, shortcut: ShortcutDefinition): boolean {
  const key = e.key.toLowerCase()
  const expected = shortcut.key.toLowerCase()

  if (key !== expected) return false
  if (!!shortcut.ctrl !== (e.ctrlKey || e.metaKey)) return false
  if (!!shortcut.shift !== e.shiftKey) return false
  if (!!shortcut.alt !== e.altKey) return false

  return true
}

export function useKeyboardShortcuts(shortcuts: ShortcutDefinition[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isInputFocused()) return

      for (const shortcut of shortcuts) {
        if (matchesShortcut(e, shortcut)) {
          e.preventDefault()
          shortcut.handler()
          return
        }
      }
    },
    [shortcuts],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const registered: RegisteredShortcut[] = useMemo(
    () =>
      shortcuts.map((s) => ({
        key: s.key,
        ctrl: s.ctrl,
        shift: s.shift,
        alt: s.alt,
        description: s.description,
        category: s.category ?? 'Other',
      })),
    [shortcuts],
  )

  return registered
}

export function formatShortcut(shortcut: RegisteredShortcut): string {
  const parts: string[] = []
  if (shortcut.ctrl) parts.push('Ctrl')
  if (shortcut.alt) parts.push('Alt')
  if (shortcut.shift) parts.push('Shift')

  const keyLabel = shortcut.key === '?' ? '?' : shortcut.key === 'Escape' ? 'Esc' : shortcut.key.toUpperCase()
  parts.push(keyLabel)

  return parts.join(' + ')
}
