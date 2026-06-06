import { useState } from 'react'
import { useProfile } from '@/stores/profile-context'
import { useAI } from '@/hooks/useAI'
import { useOllama } from '@/stores/ollama-context'
import { getConfidenceLevel } from 'shared/constants'
import { formatDictionaryForPrompt, formatSamplesForPrompt, formatGrammarForPrompt } from 'shared/prompts'

export function GrammarAnalyzer() {
  const { profile, addGrammarRule, removeGrammarRule } = useProfile()
  const { runTask, loading, streamedText } = useAI()
  const { connected } = useOllama()
  const [analysisResult, setAnalysisResult] = useState('')
  const [newRule, setNewRule] = useState('')
  const [newEvidence, setNewEvidence] = useState('')
  const [newConfidence, setNewConfidence] = useState(70)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'probable'>('all')

  const rules = profile?.grammar_rules || []
  const visible = rules.filter((r) => (filter === 'all' ? true : getConfidenceLevel(r.confidence) === filter))
  const sel = rules.find((r) => r.id === selectedId) ?? rules[0] ?? null

  const handleAnalyze = async () => {
    if (!profile) return
    const prompt = `Dictionary:\n${formatDictionaryForPrompt(profile.dictionary)}\n\nExisting grammar rules:\n${formatGrammarForPrompt(profile.grammar_rules)}\n\nSamples:\n${formatSamplesForPrompt(profile.samples)}`
    setAnalysisResult(await runTask('grammarInference', prompt))
  }

  const handleAddRule = () => {
    if (!newRule.trim()) return
    addGrammarRule({
      rule: newRule.trim(),
      evidence: newEvidence.trim() ? newEvidence.split('\n').map((s) => s.trim()).filter(Boolean) : [],
      confidence: newConfidence,
    })
    setNewRule('')
    setNewEvidence('')
    setNewConfidence(70)
  }

  const confBucket = (c: number) => (c >= 76 ? 'confirmed' : c >= 41 ? 'probable' : 'unknown')
  const fmtDate = (d: string) => { const dt = new Date(d); return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString() }

  return (
    <div className="phase-enter" style={{ display: 'grid', gridTemplateColumns: '440px 1fr 320px', gap: 16, height: '100%', overflow: 'hidden' }}>
      {/* LEFT — add rule */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto', paddingRight: 4 }}>
        <div>
          <div className="flex" style={{ alignItems: 'baseline', gap: 12 }}>
            <h1 className="h-display" style={{ margin: 0, fontSize: 30 }}>Grammar <em>Analysis</em></h1>
            <span className="kicker">PHASE 04</span>
          </div>
          <p className="dim" style={{ marginTop: 6, fontSize: 13 }}>Word order, morphology, structural patterns — each rule carries evidence and confidence.</p>
        </div>

        <div className="glass-card" style={{ padding: 18 }}>
          <span className="label">Add Grammar Rule</span>
          <div style={{ marginTop: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>Rule description</div>
            <textarea className="textarea" value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder='e.g. "Word order is SOV — verb always appears last"' style={{ minHeight: 70, fontFamily: 'var(--font-sans)', fontSize: 13 }} />
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>Evidence (one per line)</div>
            <textarea className="textarea" value={newEvidence} onChange={(e) => setNewEvidence(e.target.value)} placeholder="Supporting examples from samples…" style={{ minHeight: 80 }} />
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="label" style={{ marginBottom: 0 }}>Confidence · <span className={'font-mono c-' + confBucket(newConfidence)}>{newConfidence}%</span></span>
              <span className={'badge ' + confBucket(newConfidence)}>{confBucket(newConfidence)}</span>
            </div>
            <div style={{ position: 'relative', height: 10 }}>
              <div style={{ position: 'absolute', inset: '3px 0', borderRadius: 3, background: 'rgba(255,255,255,0.06)' }} />
              <div style={{ position: 'absolute', left: 0, top: 3, height: 4, width: newConfidence + '%', borderRadius: 3, background: newConfidence >= 76 ? 'linear-gradient(90deg, var(--accent-deep), var(--accent))' : newConfidence >= 41 ? 'linear-gradient(90deg, #b07a1f, var(--conf-probable))' : 'linear-gradient(90deg, #803333, var(--conf-unknown))', boxShadow: newConfidence >= 76 ? '0 0 8px var(--accent-soft)' : 'none' }} />
              <input type="range" min={0} max={100} value={newConfidence} onChange={(e) => setNewConfidence(+e.target.value)} style={{ position: 'absolute', inset: 0, width: '100%', appearance: 'none', background: 'transparent', margin: 0, opacity: 0.001, cursor: 'pointer' }} />
            </div>
            <div className="flex" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>0 — unknown</span>
              <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>40 — probable</span>
              <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-faint)' }}>76+ — confirmed</span>
            </div>
          </div>
          <div className="flex" style={{ gap: 8, marginTop: 14 }}>
            <button className="btn primary sm" onClick={handleAddRule} disabled={!newRule.trim()}>+ Add Rule</button>
            <button className="btn sm ghost" onClick={handleAnalyze} disabled={!connected || loading || !profile?.dictionary.length}>{loading ? 'Analyzing…' : '⌖ AI Analyze'}</button>
          </div>
        </div>
      </div>

      {/* CENTER — rule list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
          <span className="label" style={{ marginBottom: 0 }}>Active Rules · {rules.length}</span>
          <div className="flex-1" />
          {(['all', 'confirmed', 'probable'] as const).map((f) => (
            <button key={f} className="btn xs ghost" onClick={() => setFilter(f)} style={{ background: filter === f ? 'rgba(0,230,118,0.10)' : 'transparent', color: filter === f ? 'var(--accent)' : 'var(--fg-dim)', textTransform: 'capitalize' }}>{f}</button>
          ))}
        </div>
        {rules.length === 0 ? (
          <div className="glass-card" style={{ padding: 32, textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
            {profile?.dictionary.length ? 'No rules yet. Add rules manually or use AI Analyze.' : 'Build your vocabulary first to enable grammar analysis.'}
          </div>
        ) : (
          <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4, paddingBottom: 10 }}>
            {visible.map((g, i) => {
              const c = confBucket(g.confidence)
              return (
                <div key={g.id} onClick={() => setSelectedId(g.id)} className="glass-card" style={{ padding: 16, cursor: 'pointer', borderColor: sel?.id === g.id ? 'rgba(0,230,118,0.4)' : 'var(--border)', background: sel?.id === g.id ? 'rgba(0,230,118,0.05)' : 'var(--bg-rise)' }}>
                  <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-mute)' }}>RULE {String(i + 1).padStart(2, '0')}</span>
                    <span className={'badge ' + c}>{c} · {g.confidence}%</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400, color: 'var(--fg)', lineHeight: 1.35, marginBottom: 10 }}>{g.rule}</div>
                  {g.evidence.length > 0 && (
                    <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                      {g.evidence.slice(0, 3).map((e, j) => (
                        <span key={j} className="font-mono" style={{ fontSize: 11.5, color: 'var(--fg-1)', padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>{e}</span>
                      ))}
                      {g.evidence.length > 3 && <span className="font-mono" style={{ fontSize: 11, color: 'var(--fg-mute)' }}>+{g.evidence.length - 3} more</span>}
                    </div>
                  )}
                  <div className="flex" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
                    <div className={'cbar ' + c} style={{ flex: 1 }}><span style={{ width: g.confidence + '%' }} /></div>
                    <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-mute)' }}>{fmtDate(g.created_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* RIGHT — inspector + AI */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
        {sel && (
          <div className="glass-card" style={{ padding: 16 }}>
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="label" style={{ marginBottom: 0 }}>Rule Inspector</span>
              <button className="btn xs ghost" style={{ color: 'var(--conf-unknown)' }} onClick={() => removeGrammarRule(sel.id)}>Delete</button>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 400, marginTop: 8, lineHeight: 1.4, color: 'var(--fg)' }}>{sel.rule}</div>
            <div className="flex" style={{ gap: 8, marginTop: 10 }}>
              <span className={'badge ' + confBucket(sel.confidence)}>{confBucket(sel.confidence)} · {sel.confidence}%</span>
            </div>
            {sel.evidence.length > 0 && (
              <>
                <div className="label" style={{ marginTop: 14, marginBottom: 6 }}>All Evidence</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sel.evidence.map((e, i) => (
                    <div key={i} className="glass-inner" style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className={`glass-card ${loading ? 'scan-overlay' : ''}`} style={{ padding: 16 }}>
          <div className="flex" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}>
            <span className="dot" style={{ background: 'var(--ai)', boxShadow: '0 0 6px var(--ai)' }} />
            <span className="label" style={{ color: 'var(--ai)', marginBottom: 0 }}>{loading ? 'Analyzing Grammar' : 'AI Analysis'}</span>
          </div>
          {loading || analysisResult ? (
            <pre style={{ fontSize: 12.5, color: 'var(--fg-1)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', lineHeight: 1.55, margin: 0 }}>{loading ? streamedText : analysisResult}</pre>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--fg-dim)', lineHeight: 1.5 }}>Run <span className="font-mono">⌖ AI Analyze</span> to surface candidate rules from your samples and dictionary.</div>
          )}
        </div>
      </div>
    </div>
  )
}
