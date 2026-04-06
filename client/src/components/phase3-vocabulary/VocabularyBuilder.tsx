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

export function VocabularyBuilder() {
  const { profile, addDictionaryEntry, removeDictionaryEntry } = useProfile()
  const { runTask, loading, streamedText } = useAI()
  const { connected } = useOllama()
  const { pushAction } = useUndo()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: DictionaryEntry } | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [search, setSearch] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [analysisResult, setAnalysisResult] = useState('')

  // Add form state
  const [newWord, setNewWord] = useState('')
  const [newMeaning, setNewMeaning] = useState('')
  const [newPos, setNewPos] = useState<PartOfSpeech>('unknown')
  const [newConfidence, setNewConfidence] = useState(80)
  const [newContext, setNewContext] = useState('')

  const dictionary = profile?.dictionary || []

  const filtered = dictionary.filter(entry => {
    if (activeCategory !== 'all' && entry.part_of_speech !== activeCategory) return false
    if (search) {
      const q = search.toLowerCase()
      return entry.alien_word.toLowerCase().includes(q) || entry.english_meaning.toLowerCase().includes(q)
    }
    return true
  })

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

  // Build a map of dictionary entry id -> audio clip info (for entries that have segments linked)
  const audioMap = useMemo(() => {
    const map = new Map<string, { clipId: string; peaks: number[]; duration: number; start: number; end: number }>()
    for (const clip of (profile?.audio_clips || [])) {
      for (const seg of clip.segments) {
        if (seg.dictionary_entry_id) {
          map.set(seg.dictionary_entry_id, {
            clipId: clip.id,
            peaks: clip.waveform,
            duration: clip.duration,
            start: seg.start,
            end: seg.end,
          })
        }
      }
    }
    return map
  }, [profile?.audio_clips])

  const categoryCounts = VOCABULARY_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = cat === 'all' ? dictionary.length : dictionary.filter(e => e.part_of_speech === cat).length
    return acc
  }, {} as Record<string, number>)

  const handleEntryContextMenu = (e: React.MouseEvent, entry: DictionaryEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }

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
    {
      label: 'Copy Alien Word',
      icon: '\u{1F4CB}',
      onClick: () => navigator.clipboard.writeText(entry.alien_word),
    },
    {
      label: 'Copy Meaning',
      icon: '\u{1F4DD}',
      onClick: () => navigator.clipboard.writeText(entry.english_meaning),
    },
    { label: '---', onClick: () => {} },
    {
      label: 'Delete Entry',
      icon: '\u{1F5D1}',
      danger: true,
      onClick: () => handleDeleteWithUndo(entry),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-light mb-1 text-chrome">
            <span className="font-medium text-chrome-accent">Vocabulary</span> Builder
          </h2>
          <p className="text-xs text-gray-500">{dictionary.length} words mapped</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAISuggest}
            disabled={!connected || loading || !profile?.samples.length}
            className="btn-ghost text-xs"
          >
            {loading ? 'Analyzing...' : 'AI Suggest'}
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary text-xs"
          >
            + Add Word
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {VOCABULARY_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
              activeCategory === cat
                ? 'bg-accent/10 text-accent border border-accent/20 shadow-[0_0_8px_rgba(0,230,118,0.08)]'
                : 'text-gray-500 hover:text-gray-300 border border-transparent hover:border-white/[0.04]'
            }`}
          >
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            {categoryCounts[cat] > 0 && (
              <span className={`ml-1.5 ${activeCategory === cat ? 'text-accent/50' : 'text-gray-700'}`}>{categoryCounts[cat]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search + view toggle */}
      <div className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dictionary..."
          className="input flex-1"
        />
        <div className="flex glass-inner rounded-lg overflow-hidden border border-white/[0.04]">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 text-xs transition-all ${viewMode === 'cards' ? 'bg-accent/10 text-accent' : 'text-gray-500 hover:text-gray-400'}`}
          >Cards</button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-xs transition-all ${viewMode === 'table' ? 'bg-accent/10 text-accent' : 'text-gray-500 hover:text-gray-400'}`}
          >Table</button>
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="glass-card rounded-xl p-5 space-y-4 border border-accent/10">
          <label className="label text-accent mb-0">New Entry</label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Alien Word</label>
              <input
                type="text"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                className="input input-mono w-full"
                autoFocus
              />
            </div>
            <div>
              <label className="label">English Meaning</label>
              <input
                type="text"
                value={newMeaning}
                onChange={(e) => setNewMeaning(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Part of Speech</label>
              <select
                value={newPos}
                onChange={(e) => setNewPos(e.target.value as PartOfSpeech)}
                className="input w-full"
              >
                {PART_OF_SPEECH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Confidence · {newConfidence}%</label>
              <input
                type="range"
                min={0}
                max={100}
                value={newConfidence}
                onChange={(e) => setNewConfidence(Number(e.target.value))}
                className="w-full accent-accent mt-2.5"
              />
            </div>
            <div>
              <label className="label">Context</label>
              <input
                type="text"
                value={newContext}
                onChange={(e) => setNewContext(e.target.value)}
                placeholder="Where first encountered"
                className="input w-full"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={!newWord.trim() || !newMeaning.trim()}
              className="btn-primary text-xs"
            >
              Add to Dictionary
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="btn-ghost text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Dictionary display */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-600 text-sm">
            {dictionary.length === 0
              ? 'No words mapped yet. Add samples first, then use AI Suggest or add words manually.'
              : 'No matches found.'}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-3 gap-3 stagger-children">
          {filtered.map(entry => {
            const level = getConfidenceLevel(entry.confidence)
            const audio = audioMap.get(entry.id)
            return (
              <div key={entry.id} className="glass-card rounded-xl p-4 group hover:border-white/[0.06] transition-all animate-card-enter" onContextMenu={(e) => handleEntryContextMenu(e, entry)}>
                <div className="flex items-start justify-between mb-2.5">
                  <div className="min-w-0">
                    <span className="font-mono text-[15px] text-gray-100">{entry.alien_word}</span>
                    <span className="text-gray-600 mx-2">→</span>
                    <span className="text-sm text-gray-300">{entry.english_meaning}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteWithUndo(entry)}
                    className="text-xs text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all ml-3"
                  >×</button>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge badge-${level}`}>
                    {entry.confidence}%
                  </span>
                  <span className="text-[10px] text-gray-600 font-mono">{entry.part_of_speech}</span>
                  {entry.context && <span className="text-[10px] text-gray-700 truncate">{entry.context}</span>}
                </div>
                {audio && (
                  <div className="mt-2.5">
                    <AudioPlayer
                      src={`/api/audio/${audio.clipId}`}
                      peaks={audio.peaks}
                      duration={audio.duration}
                      compact
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.04]">
                <th className="text-left py-2.5 px-4 text-[10px] font-mono text-gray-600 uppercase tracking-wider">Alien Word</th>
                <th className="text-left py-2.5 px-4 text-[10px] font-mono text-gray-600 uppercase tracking-wider">English</th>
                <th className="text-left py-2.5 px-4 text-[10px] font-mono text-gray-600 uppercase tracking-wider">POS</th>
                <th className="text-left py-2.5 px-4 text-[10px] font-mono text-gray-600 uppercase tracking-wider">Confidence</th>
                <th className="text-left py-2.5 px-4 text-[10px] font-mono text-gray-600 uppercase tracking-wider">Context</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const level = getConfidenceLevel(entry.confidence)
                return (
                  <tr key={entry.id} className="border-b border-white/[0.02] group hover:bg-white/[0.01] transition-colors" onContextMenu={(e) => handleEntryContextMenu(e, entry)}>
                    <td className="py-2.5 px-4 font-mono text-gray-200">{entry.alien_word}</td>
                    <td className="py-2.5 px-4 text-gray-300">{entry.english_meaning}</td>
                    <td className="py-2.5 px-4 text-gray-600 text-xs">{entry.part_of_speech}</td>
                    <td className="py-2.5 px-4">
                      <span className={`badge badge-${level}`}>{entry.confidence}%</span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-700 text-xs truncate max-w-40">{entry.context}</td>
                    <td className="py-2.5 px-1">
                      <button
                        onClick={() => handleDeleteWithUndo(entry)}
                        className="text-xs text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      >×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Analysis */}
      {(loading || analysisResult) && (
        <div className={`glass-card rounded-xl p-5 ${loading ? 'scan-overlay' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-accent animate-pulse' : 'bg-accent/40'}`} />
            <label className="label mb-0 text-accent">
              {loading ? 'Analyzing' : 'AI Suggestions'}
            </label>
          </div>
          {loading && (
            <div className="relative h-0.5 bg-white/[0.03] rounded overflow-hidden mb-4">
              <div className="absolute inset-y-0 w-1/3 bg-accent/40 rounded animate-scan" />
            </div>
          )}
          <pre className="text-[13px] text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
            {loading ? streamedText : analysisResult}
          </pre>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.entry)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
