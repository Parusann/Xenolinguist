import { useState, useRef, useEffect } from 'react'
import type { Sample, DictionaryEntry, PartOfSpeech } from 'shared/types'
import { getConfidenceLevel, PART_OF_SPEECH_OPTIONS } from 'shared/constants'

interface SampleDecodeViewProps {
  sample: Sample
  dictionary: DictionaryEntry[]
  onClose: () => void
  onDefineWord: (entry: Omit<DictionaryEntry, 'id' | 'created_at'>) => void
}

interface TokenData {
  word: string
  entry: DictionaryEntry | null
}

interface PopoverState {
  tokenIndex: number
  mode: 'view' | 'define'
}

export function SampleDecodeView({ sample, dictionary, onClose, onDefineWord }: SampleDecodeViewProps) {
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [defineForm, setDefineForm] = useState({
    english_meaning: '',
    part_of_speech: 'unknown' as PartOfSpeech,
    confidence: 50,
    context: '',
  })
  const popoverRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Split alien text into words and look up each in the dictionary
  const tokens: TokenData[] = sample.alien_text.split(/\s+/).filter(Boolean).map(word => {
    // Strip attached punctuation for the lookup (display keeps the original token) so e.g.
    // "krash." still matches the dictionary entry "krash".
    const clean = word.toLowerCase().replace(/[^a-zà-ɏ'-]/g, '')
    const entry = dictionary.find(d => d.alien_word.toLowerCase() === clean) ?? null
    return { word, entry }
  })

  // Close popover on outside click or Escape.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPopover(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  const handleTokenClick = (index: number) => {
    const token = tokens[index]
    if (popover?.tokenIndex === index) {
      setPopover(null)
      return
    }
    if (token.entry) {
      setPopover({ tokenIndex: index, mode: 'view' })
    } else {
      setDefineForm({
        english_meaning: '',
        part_of_speech: 'unknown',
        confidence: 50,
        context: sample.alien_text,
      })
      setPopover({ tokenIndex: index, mode: 'define' })
    }
  }

  const handleDefineSubmit = () => {
    if (!popover) return
    const token = tokens[popover.tokenIndex]
    onDefineWord({
      alien_word: token.word,
      english_meaning: defineForm.english_meaning.trim(),
      part_of_speech: defineForm.part_of_speech,
      confidence: defineForm.confidence,
      context: defineForm.context.trim(),
      examples: [sample.alien_text],
      notes: '',
    })
    setPopover(null)
  }

  const getTokenClasses = (token: TokenData): string => {
    if (!token.entry) {
      return 'text-red-400/70 bg-red-400/[0.04] border-red-400/20 hover:bg-red-400/[0.08]'
    }
    const level = getConfidenceLevel(token.entry.confidence)
    if (level === 'confirmed') {
      return 'text-emerald-400 bg-emerald-400/[0.06] border-emerald-400/20 hover:bg-emerald-400/[0.1]'
    }
    if (level === 'probable') {
      return 'text-amber-400 bg-amber-400/[0.06] border-amber-400/20 hover:bg-amber-400/[0.1]'
    }
    return 'text-red-400/70 bg-red-400/[0.04] border-red-400/20 hover:bg-red-400/[0.08]'
  }

  const getConfidenceBadgeClass = (entry: DictionaryEntry): string => {
    const level = getConfidenceLevel(entry.confidence)
    if (level === 'confirmed') return 'badge badge-confirmed'
    if (level === 'probable') return 'badge badge-probable'
    return 'badge badge-unknown'
  }

  const knownCount = tokens.filter(t => t.entry !== null).length
  const totalCount = tokens.length
  const decodePercent = totalCount > 0 ? Math.round((knownCount / totalCount) * 100) : 0

  return (
    <div className="animate-fade-in" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="btn-ghost text-xs px-2 py-1">
            <span className="mr-1">&larr;</span> Back
          </button>
          <div>
            <h3 className="text-sm font-medium text-white">Decode View</h3>
            <p className="text-[10px] text-gray-600 font-mono mt-0.5">
              {knownCount}/{totalCount} words mapped &middot; {decodePercent}% decoded
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400/30" /> Confirmed
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-400/30 ml-2" /> Probable
            <span className="inline-block w-2 h-2 rounded-sm bg-red-400/30 ml-2" /> Unknown
          </div>
        </div>
      </div>

      {/* Decode progress bar */}
      <div className="h-1 bg-white/[0.03] rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-accent/40 rounded-full transition-all duration-500"
          style={{ width: `${decodePercent}%` }}
        />
      </div>

      {/* Token grid */}
      <div className="glass-inner rounded-lg p-5 mb-4">
        <label className="label mb-3">Alien Text</label>
        <div className="flex flex-wrap gap-2 relative">
          {tokens.map((token, i) => (
            <div key={i} className="relative">
              <button
                onClick={() => handleTokenClick(i)}
                className={`
                  px-3 py-1.5 rounded-md border font-mono text-sm
                  transition-all duration-200 cursor-pointer
                  ${getTokenClasses(token)}
                  ${popover?.tokenIndex === i ? 'ring-1 ring-accent/30 scale-105' : ''}
                `}
              >
                {token.word}
                {token.entry && (
                  <span className="block text-[9px] opacity-50 mt-0.5 font-sans">
                    {token.entry.english_meaning}
                  </span>
                )}
              </button>

              {/* Popover */}
              {popover?.tokenIndex === i && (
                <div
                  ref={popoverRef}
                  className="absolute z-50 top-full left-0 mt-2 animate-fade-in"
                >
                  {popover.mode === 'view' && token.entry ? (
                    <WordPopover entry={token.entry} badgeClass={getConfidenceBadgeClass(token.entry)} />
                  ) : (
                    <DefinePopover
                      word={token.word}
                      form={defineForm}
                      onChange={setDefineForm}
                      onSubmit={handleDefineSubmit}
                      onCancel={() => setPopover(null)}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-3">
        {/* Translation reference */}
        {sample.english_translation && (
          <div className="glass-inner rounded-lg p-4">
            <label className="label mb-2">English Translation</label>
            <p className="text-sm text-gray-400 leading-relaxed">{sample.english_translation}</p>
          </div>
        )}

        {/* Source & notes */}
        <div className={`glass-inner rounded-lg p-4 ${!sample.english_translation ? 'col-span-2' : ''}`}>
          <label className="label mb-2">Sample Metadata</label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-gray-600 uppercase w-14 shrink-0">Source</span>
              <span className="badge badge-probable">{sample.source}</span>
            </div>
            {sample.phonetic_notes && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-600 uppercase w-14 shrink-0">Notes</span>
                <span className="text-xs text-gray-500 italic">{sample.phonetic_notes}</span>
              </div>
            )}
            {sample.ipa && (
              <div className="glass-inner" style={{ padding: 10, marginTop: 8 }}>
                <span className="label" style={{ marginBottom: 4, display: 'block' }}>IPA · phones</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-1)' }}>{sample.ipa}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-gray-600 uppercase w-14 shrink-0">Added</span>
              <span className="text-xs text-gray-600 font-mono">
                {new Date(sample.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────── */

function WordPopover({ entry, badgeClass }: { entry: DictionaryEntry; badgeClass: string }) {
  return (
    <div className="glass rounded-xl p-4 w-72 shadow-xl shadow-black/40 border border-white/[0.06]">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-mono text-sm text-white">{entry.alien_word}</p>
          <p className="text-xs text-accent/70 mt-0.5">{entry.english_meaning}</p>
        </div>
        <span className={badgeClass}>{entry.confidence}%</span>
      </div>
      <div className="separator mb-3" />
      <div className="space-y-2 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-gray-600 font-mono uppercase w-10">POS</span>
          <span className="text-gray-400">{entry.part_of_speech}</span>
        </div>
        {entry.context && (
          <div className="flex items-start gap-2">
            <span className="text-gray-600 font-mono uppercase w-10 shrink-0">CTX</span>
            <span className="text-gray-500 leading-relaxed">{entry.context}</span>
          </div>
        )}
        {entry.examples.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-gray-600 font-mono uppercase w-10 shrink-0">EX</span>
            <span className="text-gray-500 font-mono text-[10px] leading-relaxed">
              {entry.examples[0]}
            </span>
          </div>
        )}
        {entry.notes && (
          <div className="flex items-start gap-2">
            <span className="text-gray-600 font-mono uppercase w-10 shrink-0">NOTE</span>
            <span className="text-gray-500 leading-relaxed">{entry.notes}</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface DefineFormState {
  english_meaning: string
  part_of_speech: PartOfSpeech
  confidence: number
  context: string
}

function DefinePopover({
  word,
  form,
  onChange,
  onSubmit,
  onCancel,
}: {
  word: string
  form: DefineFormState
  onChange: (form: DefineFormState) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div className="glass rounded-xl p-4 w-80 shadow-xl shadow-black/40 border border-white/[0.06]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-mono text-accent/60 uppercase tracking-wider">Define Word</p>
        <button onClick={onCancel} className="text-gray-600 hover:text-gray-400 text-xs transition-colors">
          &times;
        </button>
      </div>

      <div className="space-y-3">
        {/* Alien word (read-only) */}
        <div>
          <label className="label">Alien Word</label>
          <div className="input input-mono w-full opacity-60 cursor-default">{word}</div>
        </div>

        {/* English meaning */}
        <div>
          <label className="label">English Meaning</label>
          <input
            type="text"
            value={form.english_meaning}
            onChange={(e) => onChange({ ...form, english_meaning: e.target.value })}
            placeholder="Translation..."
            className="input w-full"
            autoFocus
          />
        </div>

        {/* Part of speech + Confidence */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Part of Speech</label>
            <select
              value={form.part_of_speech}
              onChange={(e) => onChange({ ...form, part_of_speech: e.target.value as PartOfSpeech })}
              className="input w-full"
            >
              {PART_OF_SPEECH_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Confidence</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={form.confidence}
                onChange={(e) => onChange({ ...form, confidence: Number(e.target.value) })}
                className="flex-1 accent-accent h-1"
              />
              <span className="text-[10px] font-mono text-gray-500 w-8 text-right">
                {form.confidence}%
              </span>
            </div>
          </div>
        </div>

        {/* Context */}
        <div>
          <label className="label">Context</label>
          <input
            type="text"
            value={form.context}
            onChange={(e) => onChange({ ...form, context: e.target.value })}
            placeholder="Usage context..."
            className="input w-full text-xs"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onSubmit}
            disabled={!form.english_meaning.trim()}
            className="btn-primary text-xs flex-1"
          >
            Add to Dictionary
          </button>
          <button onClick={onCancel} className="btn-ghost text-xs">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
