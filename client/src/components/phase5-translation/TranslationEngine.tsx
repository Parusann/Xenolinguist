import { useState, useMemo } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'
import { getConfidenceLevel } from 'shared/constants'
import { formatDictionaryForPrompt, formatGrammarForPrompt } from 'shared/prompts'
import type { DictionaryEntry } from 'shared/types'
import { SpeakButton } from '@/components/audio/SpeakButton'

interface TranslatedWord {
  alien: string
  english: string | null
  confidence: number
  entry: DictionaryEntry | null
  punctuation: boolean
}

const bucketOf = (conf: number) => getConfidenceLevel(conf)

export function TranslationEngine() {
  const { profile, updateDictionaryEntry, addDictionaryEntry } = useProfile()
  const { runTask, loading, streamedText } = useAI()
  const { connected } = useOllama()
  const [alienInput, setAlienInput] = useState('')
  const [aiTranslation, setAiTranslation] = useState('')
  const [reverseMode, setReverseMode] = useState(false)
  const [reverseInput, setReverseInput] = useState('')
  const [reverseOutput, setReverseOutput] = useState('')
  const [showInspector, setShowInspector] = useState(true)
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [editMeaning, setEditMeaning] = useState('')

  const dictionary = profile?.dictionary || []

  const translatedWords: TranslatedWord[] = useMemo(() => {
    if (!alienInput.trim()) return []
    return alienInput.trim().split(/\s+/).map((word) => {
      const clean = word.toLowerCase().replace(/[^a-zA-ZÀ-ɏ'-]/g, '')
      const punctuation = clean.length === 0
      const entry = dictionary.find((e) => e.alien_word.toLowerCase() === clean) || null
      return {
        alien: word,
        english: entry ? entry.english_meaning : null,
        confidence: entry ? entry.confidence : 0,
        entry,
        punctuation,
      }
    })
  }, [alienInput, dictionary])

  const realTokens = translatedWords.filter((t) => !t.punctuation)
  const mappedCount = realTokens.filter((t) => t.english).length
  const avgConf = mappedCount > 0 ? Math.round(realTokens.filter((t) => t.english).reduce((s, t) => s + t.confidence, 0) / mappedCount) : 0

  const activeIdx = pinned ?? hover
  const active = activeIdx != null ? translatedWords[activeIdx] : null

  const handleAITranslate = async () => {
    if (!profile || !alienInput.trim()) return
    const prompt = `Dictionary:\n${formatDictionaryForPrompt(profile.dictionary)}\n\nGrammar rules:\n${formatGrammarForPrompt(profile.grammar_rules)}\n\nTranslate this text:\n"${alienInput}"`
    setAiTranslation(await runTask('translation', prompt))
  }

  const handleReverseTranslate = () => {
    if (!reverseInput.trim()) return
    const out = reverseInput.trim().split(/\s+/).map((word) => {
      const clean = word.toLowerCase().replace(/[^a-z'-]/g, '')
      const entry = dictionary.find((e) => e.english_meaning.toLowerCase() === clean)
      return entry ? entry.alien_word : `[${word}]`
    })
    setReverseOutput(out.join(' '))
  }

  const pinForEdit = () => {
    if (activeIdx == null || !active) return
    setPinned(activeIdx)
    setEditing(true)
    setEditMeaning(active.english || '')
  }

  const saveCorrection = () => {
    if (!active || !editMeaning.trim()) return
    if (active.entry) {
      updateDictionaryEntry(active.entry.id, { english_meaning: editMeaning.trim() })
    } else {
      addDictionaryEntry({
        alien_word: active.alien.toLowerCase().replace(/[^a-zA-ZÀ-ɏ'-]/g, ''),
        english_meaning: editMeaning.trim(),
        part_of_speech: 'unknown',
        confidence: 60,
        context: 'Added via translation',
        examples: [],
        notes: '',
      })
    }
    setEditing(false)
    setPinned(null)
  }

  const lockIn = () => {
    if (active?.entry) updateDictionaryEntry(active.entry.id, { confidence: Math.max(76, active.entry.confidence) })
  }

  const copyTranslation = () => navigator.clipboard.writeText(translatedWords.map((t) => (t.punctuation ? t.alien : t.english || `[${t.alien}]`)).join(' '))

  const Legend = (
    <div className="flex" style={{ gap: 12, fontSize: 12 }}>
      <span className="flex" style={{ gap: 6, alignItems: 'center' }}><span className="dot confirmed" /><span className="dim">Confirmed</span></span>
      <span className="flex" style={{ gap: 6, alignItems: 'center' }}><span className="dot probable" /><span className="dim">Probable</span></span>
      <span className="flex" style={{ gap: 6, alignItems: 'center' }}><span className="dot unknown" /><span className="dim">Unknown</span></span>
    </div>
  )

  return (
    <div className="phase-enter" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="flex" style={{ alignItems: 'baseline', gap: 12 }}>
            <h1 className="h-display" style={{ margin: 0, fontSize: 30 }}>Translation <em>Engine</em></h1>
            <span className="kicker">PHASE 05</span>
          </div>
          <p className="dim" style={{ marginTop: 6, fontSize: 13 }}>Live decoding using your dictionary and AI inference. Each word is colored by confidence — hover to inspect.</p>
        </div>
        <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
          {Legend}
          <div className="glass-inner" style={{ padding: 2, display: 'flex' }}>
            <button className="btn xs ghost" style={{ background: !reverseMode ? 'rgba(0,230,118,0.10)' : 'transparent', color: !reverseMode ? 'var(--accent)' : 'var(--fg-dim)' }} onClick={() => setReverseMode(false)}>Alien → English</button>
            <button className="btn xs ghost" style={{ background: reverseMode ? 'rgba(0,230,118,0.10)' : 'transparent', color: reverseMode ? 'var(--accent)' : 'var(--fg-dim)' }} onClick={() => setReverseMode(true)}>English → Alien</button>
          </div>
        </div>
      </div>

      {!reverseMode ? (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: showInspector ? '1fr 1fr 340px' : '1fr 1fr', gap: 16, overflow: 'hidden' }}>
          {/* SOURCE */}
          <div className="glass-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="label" style={{ marginBottom: 0 }}>Source · {profile?.name || 'Unknown'}</span>
            </div>
            <textarea
              value={alienInput}
              onChange={(e) => setAlienInput(e.target.value)}
              placeholder="Enter unknown language text to translate…"
              style={{ flex: 1, resize: 'none', background: 'transparent', border: 0, outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 22, lineHeight: 1.7, color: 'var(--fg)', letterSpacing: '-0.005em' }}
            />
            <div className="flex" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button className="btn primary" onClick={handleAITranslate} disabled={!connected || loading || !alienInput.trim()}>{loading ? 'Translating…' : '⌖ AI Full Translation'}</button>
              <SpeakButton text={alienInput} title="Hear sentence" />
              <div className="flex-1" />
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--fg-mute)' }}>{realTokens.length} tokens</span>
            </div>
          </div>

          {/* TRANSLATION */}
          <div className="glass-card" style={{ padding: 22, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="label" style={{ marginBottom: 0 }}>Translation · English</span>
              {mappedCount > 0 && (
                <span className="flex" style={{ gap: 8, alignItems: 'center' }}>
                  <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-mute)' }}>avg conf</span>
                  <span className={'font-mono c-' + bucketOf(avgConf)} style={{ fontSize: 12 }}>{avgConf}%</span>
                </span>
              )}
            </div>
            <div className="expr-color" style={{ flex: 1, overflow: 'auto', fontSize: 22, lineHeight: 1.9, letterSpacing: '-0.005em' }}>
              {translatedWords.length === 0 ? (
                <span style={{ fontSize: 14, color: 'var(--fg-faint)' }}>Translation will appear here…</span>
              ) : (
                translatedWords.map((tw, i) => {
                  if (tw.punctuation) return <span key={i} style={{ color: 'var(--fg-mute)' }}>{tw.alien}{' '}</span>
                  const c = tw.english ? bucketOf(tw.confidence) : 'unknown'
                  return (
                    <span
                      key={i}
                      className={'word-token wt-' + c}
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                      onClick={() => { setPinned(i); setEditing(false) }}
                      style={{ background: activeIdx === i ? 'rgba(0,230,118,0.08)' : undefined, outline: activeIdx === i ? '1px solid rgba(0,230,118,0.3)' : undefined }}
                    >
                      {tw.english || `?${tw.alien}`}{' '}
                    </span>
                  )
                })
              )}
            </div>
            <div className="flex" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button className="btn sm ghost" onClick={copyTranslation} disabled={!translatedWords.length}>Copy</button>
              <div className="flex-1" />
              <button className="btn sm ghost" onClick={() => setShowInspector((v) => !v)} style={{ color: showInspector ? 'var(--accent)' : 'var(--fg-dim)' }}>{showInspector ? 'Hide' : 'Show'} inspector</button>
            </div>
          </div>

          {/* INSPECTOR */}
          {showInspector && (
            <div className="glass-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
              {active && !active.punctuation ? (
                <>
                  <div className="flex" style={{ justifyContent: 'space-between' }}>
                    <span className="label" style={{ marginBottom: 0 }}>Token Inspector</span>
                    <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>tok {String(activeIdx).padStart(2, '0')}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 500, color: `var(--conf-${active.english ? bucketOf(active.confidence) : 'unknown'})`, margin: '12px 0 6px' }}>{active.alien}</div>

                  <div className="label" style={{ marginTop: 10, marginBottom: 8 }}>Candidates</div>
                  {active.entry ? (
                    <div className="glass-inner" style={{ padding: '8px 10px', background: 'rgba(0,230,118,0.04)', borderColor: 'rgba(0,230,118,0.25)' }}>
                      <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{active.entry.english_meaning}</span>
                        <span className={'font-mono c-' + bucketOf(active.confidence)} style={{ fontSize: 11 }}>{active.confidence}%</span>
                      </div>
                      <div className={'cbar ' + bucketOf(active.confidence)}><span style={{ width: active.confidence + '%' }} /></div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: 'var(--fg-dim)' }}>Not in dictionary — define it below.</div>
                  )}

                  {active.entry?.part_of_speech && active.entry.part_of_speech !== 'unknown' && (
                    <div className="flex" style={{ gap: 8, marginTop: 10 }}><span className="badge">{active.entry.part_of_speech}</span></div>
                  )}

                  {active.entry?.context && (
                    <>
                      <div className="label" style={{ marginTop: 14, marginBottom: 6 }}>Note</div>
                      <div style={{ fontSize: 12.5, color: 'var(--fg-dim)', lineHeight: 1.5 }}>{active.entry.context}</div>
                    </>
                  )}

                  {active.entry && active.entry.examples.length > 0 && (
                    <>
                      <div className="label" style={{ marginTop: 14, marginBottom: 6 }}>Evidence</div>
                      <div className="flex" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {active.entry.examples.map((ex, i) => <span key={i} className="badge">{ex}</span>)}
                      </div>
                    </>
                  )}

                  {editing ? (
                    <div style={{ marginTop: 14 }}>
                      <div className="label" style={{ marginBottom: 6 }}>{active.entry ? 'Correct translation' : 'Define meaning'}</div>
                      <div className="flex" style={{ gap: 8 }}>
                        <input className="input" value={editMeaning} autoFocus onChange={(e) => setEditMeaning(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCorrection()} style={{ fontSize: 12 }} />
                        <button className="btn sm primary" onClick={saveCorrection} disabled={!editMeaning.trim()}>{active.entry ? 'Save' : 'Add'}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex" style={{ gap: 8, marginTop: 'auto', paddingTop: 12 }}>
                      <button className="btn sm primary" onClick={lockIn} disabled={!active.entry}>↓ Lock in</button>
                      <button className="btn sm ghost" onClick={pinForEdit}>{active.entry ? 'Edit' : 'Define'}</button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--fg-mute)' }}>
                  <div>
                    <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 8 }}>◌</div>
                    <div style={{ fontSize: 12.5 }}>Hover or click any word to inspect</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, overflow: 'hidden' }}>
          <div className="glass-card" style={{ padding: 22, display: 'flex', flexDirection: 'column' }}>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="label" style={{ marginBottom: 0 }}>English</span>
              <button className="btn primary sm" onClick={handleReverseTranslate} disabled={!reverseInput.trim()}>Translate</button>
            </div>
            <textarea value={reverseInput} onChange={(e) => setReverseInput(e.target.value)} placeholder="Type English text…" style={{ flex: 1, resize: 'none', background: 'transparent', border: 0, outline: 'none', fontFamily: 'var(--font-sans)', fontSize: 18, lineHeight: 1.6, color: 'var(--fg)' }} />
          </div>
          <div className="glass-card" style={{ padding: 22, display: 'flex', flexDirection: 'column' }}>
            <span className="label">Alien Output</span>
            <div style={{ flex: 1, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 20, lineHeight: 1.7, color: reverseOutput ? 'var(--accent)' : 'var(--fg-faint)' }}>
              {reverseOutput || 'Alien translation will appear here…'}
            </div>
          </div>
        </div>
      )}

      {/* AI full-translation result */}
      {(loading || aiTranslation) && !reverseMode && (
        <div className={`glass-card ${loading ? 'scan-overlay' : ''}`} style={{ padding: 16, flexShrink: 0, maxHeight: 200, overflow: 'auto' }}>
          <div className="flex" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}>
            <span className="dot" style={{ background: 'var(--ai)', boxShadow: '0 0 6px var(--ai)' }} />
            <span className="label" style={{ color: 'var(--ai)', marginBottom: 0 }}>{loading ? 'AI Translating' : 'AI Translation'}</span>
          </div>
          <pre style={{ fontSize: 13, color: 'var(--fg-1)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.6, margin: 0 }}>{loading ? streamedText : aiTranslation}</pre>
        </div>
      )}
    </div>
  )
}
