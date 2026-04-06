import { useState, useMemo, useRef, useEffect } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'
import { getConfidenceLevel } from 'shared/constants'
import { formatDictionaryForPrompt, formatGrammarForPrompt } from 'shared/prompts'

interface TranslatedWord {
  alien: string
  english: string | null
  confidence: number
  entryId: string | null
  partOfSpeech?: string
  context?: string
}

export function TranslationEngine() {
  const { profile, updateDictionaryEntry, addDictionaryEntry } = useProfile()
  const { runTask, loading, streamedText } = useAI()
  const { connected } = useOllama()
  const [alienInput, setAlienInput] = useState('')
  const [aiTranslation, setAiTranslation] = useState('')
  const [reverseMode, setReverseMode] = useState(false)
  const [reverseInput, setReverseInput] = useState('')
  const [reverseOutput, setReverseOutput] = useState('')

  // Popover state
  const [popover, setPopover] = useState<{ word: TranslatedWord; x: number; y: number } | null>(null)
  const [editMeaning, setEditMeaning] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  const dictionary = profile?.dictionary || []

  // Close popover on click outside
  useEffect(() => {
    if (!popover) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popover])

  // Simple word-by-word translation using dictionary
  const translatedWords: TranslatedWord[] = useMemo(() => {
    if (!alienInput.trim()) return []
    const words = alienInput.trim().split(/\s+/)
    return words.map(word => {
      const cleanWord = word.toLowerCase().replace(/[^a-zA-Z\u00C0-\u024F'-]/g, '')
      const entry = dictionary.find(e =>
        e.alien_word.toLowerCase() === cleanWord
      )
      if (entry) {
        return {
          alien: word,
          english: entry.english_meaning,
          confidence: entry.confidence,
          entryId: entry.id,
          partOfSpeech: entry.part_of_speech,
          context: entry.context,
        }
      }
      return { alien: word, english: null, confidence: 0, entryId: null }
    })
  }, [alienInput, dictionary])

  const handleAITranslate = async () => {
    if (!profile || !alienInput.trim()) return
    const prompt = `Dictionary:\n${formatDictionaryForPrompt(profile.dictionary)}\n\nGrammar rules:\n${formatGrammarForPrompt(profile.grammar_rules)}\n\nTranslate this text:\n"${alienInput}"`
    const result = await runTask('translation', prompt)
    setAiTranslation(result)
  }

  const handleReverseTranslate = () => {
    if (!reverseInput.trim()) return
    const words = reverseInput.trim().split(/\s+/)
    const translated = words.map(word => {
      const clean = word.toLowerCase().replace(/[^a-z'-]/g, '')
      const entry = dictionary.find(e => e.english_meaning.toLowerCase() === clean)
      return entry ? entry.alien_word : `[${word}]`
    })
    setReverseOutput(translated.join(' '))
  }

  const handleWordClick = (word: TranslatedWord, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setPopover({ word, x: rect.left, y: rect.bottom + 6 })
    setEditMeaning(word.english || '')
  }

  const handleSaveCorrection = () => {
    if (!popover || !editMeaning.trim()) return
    const { word } = popover
    if (word.entryId) {
      // Update existing entry
      updateDictionaryEntry(word.entryId, { english_meaning: editMeaning.trim() })
    } else {
      // Create new entry for unknown word
      addDictionaryEntry({
        alien_word: word.alien.toLowerCase().replace(/[^a-zA-Z\u00C0-\u024F'-]/g, ''),
        english_meaning: editMeaning.trim(),
        part_of_speech: 'unknown',
        confidence: 60,
        context: 'Added via translation correction',
        examples: [],
        notes: '',
      })
    }
    setPopover(null)
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-xl font-light mb-0 text-chrome">
              <span className="font-medium text-chrome-accent">Translation</span> Engine
            </h2>
            <p className="text-xs text-gray-500">Live translate using your dictionary and AI inference.</p>
          </div>
          <div className="flex gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400/50" />
              Confirmed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400/50" />
              Probable
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400/50" />
              Unknown
            </span>
          </div>
        </div>
        <div className="flex glass-inner rounded-lg overflow-hidden border border-white/[0.04] flex-shrink-0">
          <button
            onClick={() => setReverseMode(false)}
            className={`px-3 py-1.5 text-xs transition-all ${!reverseMode ? 'bg-accent/10 text-accent' : 'text-gray-500 hover:text-gray-400'}`}
          >Alien → English</button>
          <button
            onClick={() => setReverseMode(true)}
            className={`px-3 py-1.5 text-xs transition-all ${reverseMode ? 'bg-accent/10 text-accent' : 'text-gray-500 hover:text-gray-400'}`}
          >English → Alien</button>
        </div>
      </div>

      {!reverseMode ? (
        <>
          {/* Forward translation */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Unknown Language</label>
                <button
                  onClick={handleAITranslate}
                  disabled={!connected || loading || !alienInput.trim()}
                  className="btn-primary text-xs"
                >
                  {loading ? 'Translating...' : 'AI Full Translation'}
                </button>
              </div>
              <textarea
                value={alienInput}
                onChange={(e) => setAlienInput(e.target.value)}
                placeholder="Enter text to translate..."
                rows={8}
                className="input input-mono w-full resize-none"
              />
            </div>

            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Translation</label>
                {translatedWords.length > 0 && (
                  <span className="text-[10px] text-gray-600 font-mono">
                    {translatedWords.filter(w => w.english).length}/{translatedWords.length} mapped
                  </span>
                )}
              </div>
              <div className="glass-inner rounded-lg px-4 py-3 min-h-[200px] border border-white/[0.03] relative">
                {translatedWords.length === 0 ? (
                  <p className="text-sm text-gray-700">Translation will appear here...</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 stagger-children">
                    {translatedWords.map((tw, i) => {
                      const level = tw.english ? getConfidenceLevel(tw.confidence) : 'unknown'
                      const colorMap = {
                        confirmed: 'text-emerald-400 bg-emerald-400/[0.06] hover:bg-emerald-400/[0.12]',
                        probable: 'text-amber-400 bg-amber-400/[0.06] hover:bg-amber-400/[0.12]',
                        unknown: 'text-red-400/70 bg-red-400/[0.04] hover:bg-red-400/[0.08]',
                      }
                      return (
                        <button
                          key={i}
                          onClick={(e) => handleWordClick(tw, e)}
                          className={`inline-block px-1.5 py-0.5 rounded text-sm font-mono cursor-pointer transition-all ${colorMap[level]} hover:shadow-[0_0_8px_rgba(0,230,118,0.1)]`}
                          title={tw.english
                            ? `${tw.alien} → ${tw.english} (${tw.confidence}%)`
                            : `Unknown: ${tw.alien} — click to define`}
                        >
                          {tw.english || `?${tw.alien}`}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Reverse translation */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">English</label>
                <button
                  onClick={handleReverseTranslate}
                  disabled={!reverseInput.trim()}
                  className="btn-primary text-xs"
                >
                  Translate
                </button>
              </div>
              <textarea
                value={reverseInput}
                onChange={(e) => setReverseInput(e.target.value)}
                placeholder="Type English text..."
                rows={8}
                className="input w-full resize-none"
              />
            </div>

            <div className="glass-card rounded-xl p-5">
              <label className="label mb-2">Alien Output</label>
              <div className="glass-inner rounded-lg px-4 py-3 min-h-[200px] border border-white/[0.03]">
                {reverseOutput ? (
                  <p className="text-sm font-mono text-accent/80 leading-relaxed">{reverseOutput}</p>
                ) : (
                  <p className="text-sm text-gray-700">Alien translation will appear here...</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* AI Translation result — full width */}
      {(loading || aiTranslation) && !reverseMode && (
        <div className={`glass-card rounded-xl p-5 ${loading ? 'scan-overlay' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-accent animate-pulse' : 'bg-accent/40'}`} />
            <label className="label mb-0 text-accent">
              {loading ? 'AI Translating' : 'AI Translation'}
            </label>
          </div>
          {loading && (
            <div className="relative h-0.5 bg-white/[0.03] rounded overflow-hidden mb-4">
              <div className="absolute inset-y-0 w-1/3 bg-accent/40 rounded animate-scan" />
            </div>
          )}
          <pre className="text-[13px] text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
            {loading ? streamedText : aiTranslation}
          </pre>
        </div>
      )}

      {/* Word Popover */}
      {popover && (
        <div
          ref={popoverRef}
          className="fixed z-50 animate-fade-in"
          style={{ left: popover.x, top: popover.y }}
        >
          <div className="glass rounded-xl p-4 w-72 shadow-[0_16px_48px_rgba(0,0,0,0.6)] border border-white/[0.08] animate-scale-pop">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[15px] text-gray-100">{popover.word.alien}</span>
              <button
                onClick={() => setPopover(null)}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >×</button>
            </div>

            {popover.word.entryId ? (
              <>
                {/* Known word details */}
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-gray-600 w-16">MEANING</span>
                    <span className="text-sm text-gray-200">{popover.word.english}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-gray-600 w-16">CONF.</span>
                    <span className={`badge badge-${getConfidenceLevel(popover.word.confidence)} text-[10px]`}>
                      {popover.word.confidence}%
                    </span>
                  </div>
                  {popover.word.partOfSpeech && popover.word.partOfSpeech !== 'unknown' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-gray-600 w-16">POS</span>
                      <span className="text-xs text-gray-400">{popover.word.partOfSpeech}</span>
                    </div>
                  )}
                  {popover.word.context && (
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] font-mono text-gray-600 w-16 flex-shrink-0">CONTEXT</span>
                      <span className="text-[11px] text-gray-500">{popover.word.context}</span>
                    </div>
                  )}
                </div>

                {/* Edit correction */}
                <div className="separator my-2" />
                <label className="text-[9px] font-mono text-gray-600 uppercase tracking-wider mb-1.5 block">Correct Translation</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editMeaning}
                    onChange={(e) => setEditMeaning(e.target.value)}
                    className="input text-xs flex-1 py-1.5"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveCorrection()}
                  />
                  <button
                    onClick={handleSaveCorrection}
                    disabled={!editMeaning.trim() || editMeaning.trim() === popover.word.english}
                    className="btn-primary text-[10px] px-3 py-1.5"
                  >
                    Save
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Unknown word — define it */}
                <p className="text-xs text-gray-500 mb-3">This word isn't in your dictionary yet.</p>
                <label className="text-[9px] font-mono text-gray-600 uppercase tracking-wider mb-1.5 block">Define Meaning</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editMeaning}
                    onChange={(e) => setEditMeaning(e.target.value)}
                    placeholder="English meaning..."
                    className="input text-xs flex-1 py-1.5"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveCorrection()}
                  />
                  <button
                    onClick={handleSaveCorrection}
                    disabled={!editMeaning.trim()}
                    className="btn-primary text-[10px] px-3 py-1.5"
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
