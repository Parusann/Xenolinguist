import { useState, useEffect, useRef, useMemo } from 'react'
import { useProfile } from '@/stores/profile-context'
import { getConfidenceLevel } from 'shared/constants'

interface CommandPaletteProps {
  onClose: () => void
}

type ResultType = 'Dictionary' | 'Samples' | 'Grammar' | 'Numbers'

interface SearchResult {
  id: string
  type: ResultType
  primary: string
  secondary?: string
  confidence?: number
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const { profile } = useProfile()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Escape; also register Ctrl+K to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Build all searchable items
  const allItems = useMemo<SearchResult[]>(() => {
    if (!profile) return []
    const items: SearchResult[] = []

    for (const entry of profile.dictionary) {
      items.push({
        id: entry.id,
        type: 'Dictionary',
        primary: entry.alien_word,
        secondary: entry.english_meaning,
        confidence: entry.confidence,
      })
    }

    for (const sample of profile.samples) {
      items.push({
        id: sample.id,
        type: 'Samples',
        primary: sample.alien_text,
        secondary: sample.english_translation ?? undefined,
      })
    }

    for (const rule of profile.grammar_rules) {
      items.push({
        id: rule.id,
        type: 'Grammar',
        primary: rule.rule,
        confidence: rule.confidence,
      })
    }

    const mappings = profile.number_system.mappings
    for (const [num, alien] of Object.entries(mappings)) {
      items.push({
        id: `num-${num}`,
        type: 'Numbers',
        primary: alien,
        secondary: `= ${num}`,
      })
    }

    return items
  }, [profile])

  // Filter results
  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const matched = allItems.filter(item => {
      if (item.primary.toLowerCase().includes(q)) return true
      if (item.secondary && item.secondary.toLowerCase().includes(q)) return true
      return false
    })
    return matched.slice(0, 20)
  }, [query, allItems])

  // Group results by type
  const grouped = useMemo(() => {
    const groups: { type: ResultType; items: SearchResult[] }[] = []
    const typeOrder: ResultType[] = ['Dictionary', 'Samples', 'Grammar', 'Numbers']
    for (const type of typeOrder) {
      const items = results.filter(r => r.type === type)
      if (items.length > 0) groups.push({ type, items })
    }
    return groups
  }, [results])

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => grouped.flatMap(g => g.items), [grouped])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % Math.max(flatResults.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + Math.max(flatResults.length, 1)) % Math.max(flatResults.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Future: navigate to selected item
      onClose()
    }
  }

  const confidenceBadgeClass = (confidence: number) => {
    const level = getConfidenceLevel(confidence)
    if (level === 'confirmed') return 'badge-confirmed'
    if (level === 'probable') return 'badge-probable'
    return 'badge-unknown'
  }

  const typeBadgeColor = (type: ResultType) => {
    switch (type) {
      case 'Dictionary': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
      case 'Samples': return 'text-blue-400 bg-blue-400/10 border-blue-400/20'
      case 'Grammar': return 'text-amber-400 bg-amber-400/10 border-amber-400/20'
      case 'Numbers': return 'text-purple-400 bg-purple-400/10 border-purple-400/20'
    }
  }

  // Highlight matching text
  const highlightMatch = (text: string) => {
    if (!query.trim()) return <span>{text}</span>
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return <span>{text}</span>
    const before = text.slice(0, idx)
    const match = text.slice(idx, idx + query.length)
    const after = text.slice(idx + query.length)
    return (
      <span>
        {before}
        <span className="text-accent font-semibold">{match}</span>
        {after}
      </span>
    )
  }

  let flatIndex = -1

  return (
    <div
      className="fixed inset-0 z-50 animate-backdrop"
      onClick={onClose}
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="max-w-xl mx-auto mt-[15vh] glass rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6)] border border-border overflow-hidden animate-scale-pop"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="text-gray-500 text-lg select-none">{'\u2315'}</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search dictionary, samples, rules..."
            className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none font-mono"
          />
          <kbd className="text-[10px] text-gray-600 font-mono px-1.5 py-0.5 rounded border border-border bg-black/20">ESC</kbd>
        </div>

        {/* Results area */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {query.trim() === '' ? (
            /* Empty state */
            <div className="px-4 py-8 text-center">
              <p className="text-gray-600 text-sm mb-3">Start typing to search across all data</p>
              <div className="flex justify-center gap-4 text-[11px] text-gray-700 font-mono">
                <span>Dictionary entries</span>
                <span className="text-gray-800">|</span>
                <span>Samples</span>
                <span className="text-gray-800">|</span>
                <span>Grammar rules</span>
                <span className="text-gray-800">|</span>
                <span>Numbers</span>
              </div>
              <div className="mt-4 flex justify-center gap-3 text-[10px] text-gray-700 font-mono">
                <span><kbd className="px-1 py-0.5 rounded border border-border bg-black/20 mr-1">{'\u2191'}{'\u2193'}</kbd> navigate</span>
                <span><kbd className="px-1 py-0.5 rounded border border-border bg-black/20 mr-1">Enter</kbd> select</span>
                <span><kbd className="px-1 py-0.5 rounded border border-border bg-black/20 mr-1">Esc</kbd> close</span>
              </div>
            </div>
          ) : results.length === 0 ? (
            /* No results */
            <div className="px-4 py-8 text-center">
              <p className="text-gray-500 text-sm">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-gray-700 text-[11px] mt-1">Try a different search term</p>
            </div>
          ) : (
            /* Grouped results */
            grouped.map(group => (
              <div key={group.type}>
                <div className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-wider text-gray-600 bg-black/20 sticky top-0">
                  {group.type}
                </div>
                {group.items.map(item => {
                  flatIndex++
                  const isSelected = flatIndex === selectedIndex
                  const currentFlatIndex = flatIndex
                  return (
                    <div
                      key={item.id}
                      data-selected={isSelected}
                      className={`
                        px-4 py-2 flex items-center gap-3 cursor-pointer transition-colors
                        ${isSelected ? 'bg-accent/10' : 'hover:bg-white/[0.03]'}
                      `}
                      onClick={() => onClose()}
                      onMouseEnter={() => setSelectedIndex(currentFlatIndex)}
                    >
                      {/* Type badge */}
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${typeBadgeColor(item.type)}`}>
                        {item.type === 'Dictionary' ? 'DICT' : item.type === 'Samples' ? 'SMPL' : item.type === 'Grammar' ? 'GRAM' : 'NUM'}
                      </span>

                      {/* Main text */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-300 truncate font-mono">
                          {highlightMatch(item.primary)}
                        </div>
                        {item.secondary && (
                          <div className="text-[11px] text-gray-600 truncate">
                            {highlightMatch(item.secondary)}
                          </div>
                        )}
                      </div>

                      {/* Confidence badge */}
                      {item.confidence !== undefined && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${confidenceBadgeClass(item.confidence)}`}>
                          {item.confidence}%
                        </span>
                      )}

                      {/* Selection indicator */}
                      {isSelected && (
                        <span className="text-[10px] text-gray-600 font-mono shrink-0">{'Enter \u21B5'}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 py-1.5 border-t border-border flex items-center justify-between text-[10px] text-gray-700 font-mono">
            <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
            <span>ESC to close</span>
          </div>
        )}
      </div>
    </div>
  )
}
