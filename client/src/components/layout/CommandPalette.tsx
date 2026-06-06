import { useState, useEffect, useRef, useMemo } from 'react'
import { useProfile } from '@/stores/profile-context'
import { getConfidenceLevel } from 'shared/constants'

interface CommandPaletteProps {
  onClose: () => void
  onNavigate?: (phaseId: string) => void
  onOpenAIChat?: () => void
  onShowShortcuts?: () => void
  onRestartTour?: () => void
}

type Kind = 'nav' | 'tool' | 'help' | 'dict' | 'smpl' | 'gram' | 'num'

interface Item {
  id: string
  kind: Kind
  label: string
  secondary?: string
  hint?: string
  confidence?: number
  run: () => void
}

const KIND_COLOR: Record<Kind, string> = {
  nav: 'var(--accent)',
  tool: 'var(--ai)',
  help: 'var(--fg-mute)',
  dict: 'var(--conf-confirmed)',
  smpl: 'var(--fg-1)',
  gram: 'var(--conf-probable)',
  num: 'var(--ai)',
}

export function CommandPalette({ onClose, onNavigate, onOpenAIChat, onShowShortcuts, onRestartTour }: CommandPaletteProps) {
  const { profile } = useProfile()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const go = (phaseId: string) => { onNavigate?.(phaseId); onClose() }

  const commands: Item[] = useMemo(() => [
    { id: 'c-samples', kind: 'nav', label: 'Go to Samples', hint: '1', run: () => go('samples') },
    { id: 'c-numbers', kind: 'nav', label: 'Go to Numbers', hint: '2', run: () => go('numbers') },
    { id: 'c-vocabulary', kind: 'nav', label: 'Go to Vocabulary', hint: '3', run: () => go('vocabulary') },
    { id: 'c-grammar', kind: 'nav', label: 'Go to Grammar', hint: '4', run: () => go('grammar') },
    { id: 'c-translation', kind: 'nav', label: 'Go to Translation', hint: '5', run: () => go('translation') },
    { id: 'c-dashboard', kind: 'nav', label: 'Go to Dashboard', hint: '6', run: () => go('dashboard') },
    { id: 'c-ai', kind: 'tool', label: 'Open AI Chat', hint: '⇧A', run: () => { onOpenAIChat?.(); onClose() } },
    { id: 'c-tour', kind: 'help', label: 'Restart onboarding tour', run: () => { onRestartTour?.(); onClose() } },
    { id: 'c-shortcuts', kind: 'help', label: 'Show keyboard shortcuts', hint: '?', run: () => { onShowShortcuts?.(); onClose() } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [onNavigate, onOpenAIChat, onShowShortcuts, onRestartTour])

  const dataItems: Item[] = useMemo(() => {
    if (!profile) return []
    const items: Item[] = []
    for (const e of profile.dictionary) items.push({ id: e.id, kind: 'dict', label: e.alien_word, secondary: e.english_meaning, confidence: e.confidence, run: () => go('vocabulary') })
    for (const s of profile.samples) items.push({ id: s.id, kind: 'smpl', label: s.alien_text, secondary: s.english_translation ?? undefined, run: () => go('samples') })
    for (const r of profile.grammar_rules) items.push({ id: r.id, kind: 'gram', label: r.rule, confidence: r.confidence, run: () => go('grammar') })
    for (const [n, w] of Object.entries(profile.number_system.mappings)) items.push({ id: `num-${n}`, kind: 'num', label: String(w), secondary: `= ${n}`, run: () => go('numbers') })
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const results: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matchCmd = commands.filter((c) => !q || c.label.toLowerCase().includes(q))
    if (!q) return matchCmd
    const matchData = dataItems.filter((d) => d.label.toLowerCase().includes(q) || (d.secondary || '').toLowerCase().includes(q)).slice(0, 20)
    return [...matchCmd, ...matchData]
  }, [query, commands, dataItems])

  useEffect(() => { setSelected(0) }, [query])
  useEffect(() => { listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' }) }, [selected])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((p) => (p + 1) % Math.max(results.length, 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((p) => (p - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); results[selected]?.run() }
  }

  const highlight = (text: string) => {
    const q = query.trim()
    if (!q) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return <>{text.slice(0, idx)}<span style={{ color: 'var(--accent)', fontWeight: 600 }}>{text.slice(idx, idx + q.length)}</span>{text.slice(idx + q.length)}</>
  }

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="popover cmd-box" onClick={(e) => e.stopPropagation()}>
        <div className="flex" style={{ gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--accent)' }}>⌘</span>
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKeyDown} placeholder="Search commands, words, samples…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'var(--font-sans)', color: 'var(--fg)' }} />
          <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>ESC</span>
        </div>

        <div ref={listRef} style={{ maxHeight: '50vh', overflow: 'auto', padding: 8 }}>
          {results.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>No matches{query ? ` for “${query}”` : ''}</div>
          ) : (
            results.map((item, i) => (
              <div
                key={item.id}
                data-sel={i === selected}
                onClick={() => item.run()}
                onMouseEnter={() => setSelected(i)}
                className="flex"
                style={{ gap: 12, padding: '9px 12px', borderRadius: 6, cursor: 'pointer', alignItems: 'center', background: i === selected ? 'rgba(0,230,118,0.08)' : 'transparent' }}
              >
                <span className="font-mono" style={{ fontSize: 10, color: KIND_COLOR[item.kind], width: 38, flexShrink: 0, textTransform: 'uppercase' }}>{item.kind}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: item.kind === 'nav' || item.kind === 'tool' || item.kind === 'help' ? 'var(--font-sans)' : 'var(--font-mono)' }}>{highlight(item.label)}</div>
                  {item.secondary && <div style={{ fontSize: 11, color: 'var(--fg-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{highlight(item.secondary)}</div>}
                </div>
                {item.confidence !== undefined && <span className={'badge ' + getConfidenceLevel(item.confidence)} style={{ flexShrink: 0 }}>{item.confidence}%</span>}
                {item.hint && <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-faint)', flexShrink: 0 }}>{item.hint}</span>}
              </div>
            ))
          )}
        </div>

        <div className="flex" style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-faint)', gap: 14 }}>
          <span>↑↓ navigate</span><span>↵ execute</span><span>ESC dismiss</span>
        </div>
      </div>
    </div>
  )
}
