import { useState, useMemo } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'
import { useUndo } from '@/stores/undo-context'
import { VOCABULARY_CATEGORIES, PART_OF_SPEECH_OPTIONS, getConfidenceLevel } from 'shared/constants'
import { formatDictionaryForPrompt, formatSamplesForPrompt } from 'shared/prompts'
import type { PartOfSpeech, DictionaryEntry } from 'shared/types'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { ContextMenu, type ContextMenuItem } from '@/components/layout/ContextMenu'
import { ConfRing } from '@/components/common/ConfRing'
import { getConfidenceCounts } from '@/lib/profileStats'

const BUCKET_COLOR: Record<string, string> = {
  confirmed: 'var(--conf-confirmed)',
  probable: 'var(--conf-probable)',
  unknown: 'var(--conf-unknown)',
}

export function VocabularyBuilder() {
  const { profile, addDictionaryEntry, removeDictionaryEntry, updateProfile } = useProfile()
  const { runTask, loading, streamedText } = useAI()
  const { connected } = useOllama()
  const { pushAction } = useUndo()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: DictionaryEntry } | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [search, setSearch] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [analysisResult, setAnalysisResult] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<DictionaryEntry>>({})

  // Add form state
  const [newWord, setNewWord] = useState('')
  const [newMeaning, setNewMeaning] = useState('')
  const [newPos, setNewPos] = useState<PartOfSpeech>('unknown')
  const [newConfidence, setNewConfidence] = useState(80)
  const [newContext, setNewContext] = useState('')

  const dictionary = profile?.dictionary || []
  const counts = profile ? getConfidenceCounts(profile) : { confirmed: 0, probable: 0, unknown: 0, total: 0 }

  const filtered = dictionary.filter((entry) => {
    if (activeCategory !== 'all' && entry.part_of_speech !== activeCategory) return false
    if (search) {
      const q = search.toLowerCase()
      return entry.alien_word.toLowerCase().includes(q) || entry.english_meaning.toLowerCase().includes(q)
    }
    return true
  })

  const sel = dictionary.find((e) => e.id === selectedId) ?? dictionary[0] ?? null

  const handleAdd = () => {
    if (!newWord.trim() || !newMeaning.trim()) return
    addDictionaryEntry({
      alien_word: newWord.trim(),
      english_meaning: newMeaning.trim(),
      part_of_speech: newPos,
      confidence: newConfidence,
      context: newContext.trim(),
      examples: [],
      notes: '',
    })
    setNewWord('')
    setNewMeaning('')
    setNewPos('unknown')
    setNewConfidence(80)
    setNewContext('')
    setShowAddForm(false)
  }

  const handleAISuggest = async () => {
    if (!profile) return
    const prompt = `Current dictionary:\n${formatDictionaryForPrompt(profile.dictionary)}\n\nSamples:\n${formatSamplesForPrompt(profile.samples)}\n\nAnalyze the samples and suggest word meanings for any unmapped words you can identify.`
    const result = await runTask('patternAnalysis', prompt)
    setAnalysisResult(result)
  }

  const updateEntry = (id: string, patch: Partial<DictionaryEntry>) => {
    updateProfile({ dictionary: dictionary.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  }

  const promote = (entry: DictionaryEntry) => {
    const level = getConfidenceLevel(entry.confidence)
    const next = level === 'unknown' ? 60 : level === 'probable' ? 88 : Math.min(100, entry.confidence + 5)
    updateEntry(entry.id, { confidence: next })
  }
  const demote = (entry: DictionaryEntry) => {
    const level = getConfidenceLevel(entry.confidence)
    const next = level === 'confirmed' ? 60 : level === 'probable' ? 30 : Math.max(0, entry.confidence - 10)
    updateEntry(entry.id, { confidence: next })
  }

  const startEdit = () => {
    if (!sel) return
    setDraft({
      english_meaning: sel.english_meaning,
      part_of_speech: sel.part_of_speech,
      confidence: sel.confidence,
      context: sel.context,
      notes: sel.notes,
    })
    setEditing(true)
  }
  const saveEdit = () => {
    if (sel) updateEntry(sel.id, draft)
    setEditing(false)
  }

  const audioMap = useMemo(() => {
    const map = new Map<string, { clipId: string; peaks: number[]; duration: number; start: number; end: number }>()
    for (const clip of profile?.audio_clips || []) {
      for (const seg of clip.segments) {
        if (seg.dictionary_entry_id) {
          map.set(seg.dictionary_entry_id, { clipId: clip.id, peaks: clip.waveform, duration: clip.duration, start: seg.start, end: seg.end })
        }
      }
    }
    return map
  }, [profile?.audio_clips])

  const categoryCounts = VOCABULARY_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = cat === 'all' ? dictionary.length : dictionary.filter((e) => e.part_of_speech === cat).length
    return acc
  }, {} as Record<string, number>)

  const handleDeleteWithUndo = (entry: DictionaryEntry) => {
    removeDictionaryEntry(entry.id)
    pushAction({
      description: `Removed word '${entry.alien_word}'`,
      undo: () => {
        addDictionaryEntry({
          alien_word: entry.alien_word,
          english_meaning: entry.english_meaning,
          part_of_speech: entry.part_of_speech,
          confidence: entry.confidence,
          context: entry.context,
          examples: entry.examples,
          notes: entry.notes,
        })
      },
    })
  }

  const getContextMenuItems = (entry: DictionaryEntry): ContextMenuItem[] => [
    { label: 'Copy Alien Word', icon: '\u{1F4CB}', onClick: () => navigator.clipboard.writeText(entry.alien_word) },
    { label: 'Copy Meaning', icon: '\u{1F4DD}', onClick: () => navigator.clipboard.writeText(entry.english_meaning) },
    { label: '---', onClick: () => {} },
    { label: 'Delete Entry', icon: '\u{1F5D1}', danger: true, onClick: () => handleDeleteWithUndo(entry) },
  ]

  return (
    <div className="phase-enter" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, height: '100%', overflow: 'hidden' }}>
      {/* LEFT — list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div className="flex" style={{ alignItems: 'baseline', gap: 12 }}>
              <h1 className="h-display" style={{ margin: 0, fontSize: 30 }}>Vocabulary <em>Builder</em></h1>
              <span className="kicker">PHASE 03</span>
            </div>
            <p className="dim" style={{ marginTop: 6, fontSize: 13 }}>
              <span className="font-mono c-confirmed">{counts.confirmed}</span> confirmed ·{' '}
              <span className="font-mono c-probable">{counts.probable}</span> probable ·{' '}
              <span className="font-mono c-unknown">{counts.unknown}</span> unknown ·{' '}
              <span className="font-mono">{counts.total}</span> total
            </p>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <button className="btn sm" onClick={handleAISuggest} disabled={!connected || loading || !profile?.samples.length}>
              {loading ? 'Analyzing…' : '⌖ AI Suggest'}
            </button>
            <button className="btn primary sm" onClick={() => setShowAddForm((v) => !v)}>+ Add Word</button>
          </div>
        </div>

        {/* POS filter pills */}
        <div className="flex" style={{ gap: 4, flexWrap: 'wrap' }}>
          {VOCABULARY_CATEGORIES.map((cat) => {
            const active = activeCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="btn xs"
                style={{
                  background: active ? 'rgba(0,230,118,0.10)' : 'transparent',
                  borderColor: active ? 'rgba(0,230,118,0.4)' : 'var(--border)',
                  color: active ? 'var(--accent)' : 'var(--fg-dim)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span>{cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                {categoryCounts[cat] > 0 && <span style={{ opacity: 0.6 }}>{categoryCounts[cat]}</span>}
              </button>
            )
          })}
        </div>

        {/* Search + view toggle */}
        <div className="flex" style={{ gap: 8 }}>
          <input className="input" placeholder="Search dictionary…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
          <div className="flex-1" />
          <div className="glass-inner" style={{ padding: 2, display: 'flex' }}>
            <button className="btn xs ghost" style={{ background: viewMode === 'cards' ? 'rgba(0,230,118,0.10)' : 'transparent', color: viewMode === 'cards' ? 'var(--accent)' : 'var(--fg-dim)' }} onClick={() => setViewMode('cards')}>Cards</button>
            <button className="btn xs ghost" style={{ background: viewMode === 'table' ? 'rgba(0,230,118,0.10)' : 'transparent', color: viewMode === 'table' ? 'var(--accent)' : 'var(--fg-dim)' }} onClick={() => setViewMode('table')}>Table</button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="label" style={{ color: 'var(--accent)', marginBottom: 0 }}>New Entry</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Alien Word</label>
                <input value={newWord} onChange={(e) => setNewWord(e.target.value)} className="input" autoFocus />
              </div>
              <div>
                <label className="label">English Meaning</label>
                <input value={newMeaning} onChange={(e) => setNewMeaning(e.target.value)} className="input" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Part of Speech</label>
                <select value={newPos} onChange={(e) => setNewPos(e.target.value as PartOfSpeech)} className="input">
                  {PART_OF_SPEECH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Confidence · {newConfidence}%</label>
                <input type="range" min={0} max={100} value={newConfidence} onChange={(e) => setNewConfidence(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)', marginTop: 10 }} />
              </div>
              <div>
                <label className="label">Context</label>
                <input value={newContext} onChange={(e) => setNewContext(e.target.value)} placeholder="Where first encountered" className="input" />
              </div>
            </div>
            <div className="flex" style={{ gap: 8 }}>
              <button className="btn primary sm" onClick={handleAdd} disabled={!newWord.trim() || !newMeaning.trim()}>Add to Dictionary</button>
              <button className="btn sm ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* List */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--fg-mute)', fontSize: 13 }}>
            {dictionary.length === 0 ? 'No words mapped yet. Add samples first, then use AI Suggest or add words manually.' : 'No matches found.'}
          </div>
        ) : viewMode === 'cards' ? (
          <div style={{ overflow: 'auto', paddingRight: 4, paddingBottom: 10 }}>
            <div className="expr-color" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, alignItems: 'stretch' }}>
              {filtered.map((entry) => {
                const level = getConfidenceLevel(entry.confidence)
                const audio = audioMap.get(entry.id)
                const isSel = sel?.id === entry.id
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedId(entry.id)}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, entry }) }}
                    className="glass-card"
                    style={{ padding: 14, cursor: 'pointer', borderColor: isSel ? 'rgba(0,230,118,0.4)' : 'var(--border)', background: isSel ? 'rgba(0,230,118,0.05)' : 'var(--bg-rise)' }}
                  >
                    <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="badge">{entry.part_of_speech}</span>
                      <ConfRing value={entry.confidence} size={28} stroke={2.5} />
                    </div>
                    <div className={'word-token wt-' + level} style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, marginBottom: 2, padding: 0 }}>{entry.alien_word}</div>
                    <div className="dim" style={{ fontSize: 13, marginBottom: 8 }}>{entry.english_meaning || <span style={{ fontStyle: 'italic' }}>unknown meaning</span>}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-mute)', lineHeight: 1.5, minHeight: 32 }}>{entry.context || <span style={{ color: 'var(--fg-faint)' }}>no context</span>}</div>
                    {audio && (
                      <div style={{ marginTop: 10 }}>
                        <AudioPlayer src={`/api/audio/${audio.clipId}`} peaks={audio.peaks} duration={audio.duration} compact />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div style={{ overflow: 'auto', paddingRight: 4, paddingBottom: 10 }}>
            <table className="glass-card expr-color" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: 'var(--fg-mute)', textAlign: 'left' }}>
                  {['WORD', 'MEANING', 'POS', 'CONF', 'CONTEXT'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const level = getConfidenceLevel(entry.confidence)
                  return (
                    <tr key={entry.id} onClick={() => setSelectedId(entry.id)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, entry }) }} style={{ background: sel?.id === entry.id ? 'rgba(0,230,118,0.05)' : 'transparent', cursor: 'pointer' }}>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}><span className={'word-token wt-' + level} style={{ padding: 0, fontSize: 13 }}>{entry.alien_word}</span></td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--fg-1)', fontFamily: 'var(--font-sans)' }}>{entry.english_meaning}</td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--fg-mute)' }}>{entry.part_of_speech}</td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                        <div className="flex" style={{ gap: 8 }}>
                          <div className={'cbar ' + level} style={{ width: 60 }}><span style={{ width: entry.confidence + '%' }} /></div>
                          <span style={{ fontSize: 11 }}>{entry.confidence}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--fg-mute)', fontFamily: 'var(--font-sans)', fontSize: 12, maxWidth: 320 }}>{entry.context || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* AI analysis */}
        {(loading || analysisResult) && (
          <div className={`glass-card ${loading ? 'scan-overlay' : ''}`} style={{ padding: 16 }}>
            <div className="flex" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}>
              <span className="dot" style={{ background: 'var(--ai)', boxShadow: '0 0 6px var(--ai)' }} />
              <span className="label" style={{ color: 'var(--ai)', marginBottom: 0 }}>{loading ? 'Analyzing' : 'AI Suggestions'}</span>
            </div>
            <pre style={{ fontSize: 13, color: 'var(--fg-1)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.6, margin: 0 }}>{loading ? streamedText : analysisResult}</pre>
          </div>
        )}
      </div>

      {/* RIGHT — inspector */}
      <div className="glass-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
        {sel ? (
          <>
            <div className="flex" style={{ justifyContent: 'space-between' }}>
              <span className="label" style={{ marginBottom: 0 }}>Inspector</span>
              {editing ? (
                <div className="flex" style={{ gap: 8 }}>
                  <button className="btn xs" onClick={saveEdit}>Save</button>
                  <button className="btn xs ghost" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn xs ghost" onClick={startEdit}>Edit</button>
              )}
            </div>

            <div className="flex" style={{ alignItems: 'flex-start', gap: 14 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 500, color: BUCKET_COLOR[getConfidenceLevel(sel.confidence)], lineHeight: 1 }}>{sel.alien_word}</div>
              <div className="flex-1" />
              <ConfRing value={editing ? draft.confidence ?? sel.confidence : sel.confidence} size={52} stroke={3.5} />
            </div>

            {editing ? (
              <>
                <div>
                  <label className="label">Meaning</label>
                  <input className="input" value={draft.english_meaning ?? ''} onChange={(e) => setDraft((d) => ({ ...d, english_meaning: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Part of Speech</label>
                  <select className="input" value={draft.part_of_speech} onChange={(e) => setDraft((d) => ({ ...d, part_of_speech: e.target.value as PartOfSpeech }))}>
                    {PART_OF_SPEECH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Confidence · {draft.confidence}%</label>
                  <input type="range" min={0} max={100} value={draft.confidence ?? 0} onChange={(e) => setDraft((d) => ({ ...d, confidence: Number(e.target.value) }))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
                </div>
                <div>
                  <label className="label">Context</label>
                  <input className="input" value={draft.context ?? ''} onChange={(e) => setDraft((d) => ({ ...d, context: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea className="textarea" style={{ minHeight: 60 }} value={draft.notes ?? ''} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 300, color: 'var(--fg)' }}>
                  {sel.english_meaning || <span className="dim" style={{ fontStyle: 'italic' }}>unknown meaning</span>}
                </div>
                <div className="flex" style={{ gap: 8 }}>
                  <span className="badge">{sel.part_of_speech}</span>
                  <span className={'badge ' + getConfidenceLevel(sel.confidence)}>{getConfidenceLevel(sel.confidence)}</span>
                </div>
                <hr className="hr" style={{ margin: '4px 0' }} />
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Context</div>
                  <div style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.5 }}>{sel.context || <span className="dim">No context recorded.</span>}</div>
                </div>
                {sel.examples.length > 0 && (
                  <div>
                    <div className="label" style={{ marginBottom: 6 }}>Examples</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sel.examples.map((ex, i) => (
                        <div key={i} className="glass-inner" style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{ex}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Notes</div>
                  <div style={{ fontSize: 12.5, color: 'var(--fg-dim)', lineHeight: 1.5 }}>{sel.notes || <span className="dim">—</span>}</div>
                </div>
                <div className="glass-inner" style={{ padding: 12, marginTop: 6 }}>
                  <div className="flex" style={{ gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <span className="dot" style={{ background: 'var(--ai)', boxShadow: '0 0 6px var(--ai)' }} />
                    <span className="label" style={{ color: 'var(--ai)', marginBottom: 0 }}>AI Suggestion</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg-1)', lineHeight: 1.5 }}>
                    {getConfidenceLevel(sel.confidence) === 'confirmed'
                      ? 'High confidence — appears consistently across multiple samples with the same gloss.'
                      : getConfidenceLevel(sel.confidence) === 'probable'
                      ? 'Probable. Consider eliciting in a controlled context to confirm part-of-speech.'
                      : 'Insufficient evidence. Try parallel-mode capture with a native speaker present.'}
                  </div>
                </div>
                <div className="flex" style={{ gap: 8, marginTop: 'auto' }}>
                  <button className="btn sm" onClick={() => promote(sel)}>↑ Promote</button>
                  <button className="btn sm ghost" onClick={() => demote(sel)}>⌫ Demote</button>
                  <button className="btn sm ghost" style={{ marginLeft: 'auto', color: 'var(--conf-unknown)' }} onClick={() => handleDeleteWithUndo(sel)}>Delete</button>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="dim">No word selected — add or map a word to inspect it.</div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={getContextMenuItems(contextMenu.entry)} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}
