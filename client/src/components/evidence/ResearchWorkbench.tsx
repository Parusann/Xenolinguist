import './evidence.css'
import { checkSuppliedTarget } from 'engine/evidence/tests'
import type { ResearchAnalysis } from 'shared/types'
import { useState } from 'react'
import type { Hypothesis, Observation } from 'shared/types'
import { useProfile } from '@/stores/profile-context'
import { latestAnnotation, withdrawn } from 'engine/evidence/graph'
import { staleReasons } from 'engine/evidence/dependencies'
import { HypothesisComparison } from './HypothesisComparison'
import { recordIdentity } from './identity'

export function ResearchWorkbench() {
  const { profile, editResearch, saveStatus } = useProfile()
  const [capture, setCapture] = useState(''), [context, setContext] = useState(''), [sampleId, setSampleId] = useState('')
  const [target, setTarget] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [limit, setLimit] = useState(20)
  if (!profile) return null
  const edit: Parameters<typeof HypothesisComparison>[0]['edit'] = fn => {
    try { editResearch(profile.id, fn); setError('') } catch (e) { setError((e as Error).message) }
  }
  const captureObservation = async () => {
    setBusy(true)
    try {
      const sample = profile.samples.find(s => s.id === sampleId)
      const text = sample ? sample.alien_text : capture
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      const clip = profile.audio_clips.find(c => c.id === sample?.audio_id)
      const observation: Observation = { ...recordIdentity(), text, content_sha256: [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join(''),
        source: sample ? sample.source : context, origin: sample ? 'sample' : 'capture', source_id: sample?.id ?? null, derived_from: [],
        audio: clip?.assets ? { clip_id: clip.id, start: 0, end: clip.duration, asset_sha256: clip.assets.original.sha256 } : null }
      editResearch(profile.id, r => ({ ...r, observations: [...r.observations, observation] }))
      setCapture(''); setError('')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const propose = () => {
    const word = profile.dictionary.find(w => w.id === target), rule = profile.grammar_rules.find(r => r.id === target)
    const content: Hypothesis['content'] | null = word ? { kind: 'lexical', entry_id: word.id, form: word.alien_word, meaning: word.english_meaning }
      : rule?.executable ? { kind: 'grammar', rule_id: rule.id, rule: rule.executable } : null
    if (!content) return
    edit(r => ({ ...r, hypotheses: [...r.hypotheses, { ...recordIdentity(), content, label: word ? `${word.alien_word} → ${word.english_meaning}` : rule!.rule,
      provenance: 'user', manual_belief: word?.confidence ?? rule?.confidence ?? null, score_definition: 'evidence-counts-1', supersedes: null }] }))
  }
  return <section aria-label="Research evidence" className="glass-card research-workbench" style={{ padding: 20, marginBottom: 16 }}>
    <h2 className="label">Research evidence</h2>
    <p>Keep original captures, revise interpretations, and compare evidence for explicit hypotheses. Counts deduplicate source text and model restatements; they do not measure probability or independent collection.</p>
    {error && <p role="alert">{error}</p>}
    <label>Capture a saved sample<select value={sampleId} onChange={e => setSampleId(e.target.value)}><option value="">New text capture</option>
      {profile.samples.map(s => <option key={s.id} value={s.id}>{s.alien_text.slice(0, 80)}</option>)}</select></label>
    {!sampleId && <><label>Original observation<textarea value={capture} maxLength={8192} onChange={e => setCapture(e.target.value)} /></label>
      <label>Source context<input value={context} maxLength={8192} onChange={e => setContext(e.target.value)} /></label></>}
    <button className="btn sm" disabled={busy || !(sampleId ? profile.samples.find(s => s.id === sampleId)?.alien_text.trim() : capture.trim())} onClick={() => void captureObservation()}>Capture observation</button>
    <p className="dim">Capturing a sample copies its original text and available recording identity. Later notebook edits do not rewrite that capture. Entire available clips are retained; links can select exact text spans.</p>
    {profile.research.observations.slice(-limit).map(o => <ObservationEditor key={o.id} observation={o} />)}
    <h3>Competing hypotheses</h3>
    <label>Assertion to investigate<select value={target} onChange={e => setTarget(e.target.value)}><option value="">Choose a word or executable rule</option>
      {profile.dictionary.map(w => <option key={w.id} value={w.id}>{w.alien_word} → {w.english_meaning}</option>)}
      {profile.grammar_rules.filter(r => r.executable).map(r => <option key={r.id} value={r.id}>{r.rule}</option>)}
    </select></label>
    <button className="btn sm" disabled={!target} onClick={propose}>Propose hypothesis</button>
    {profile.research.hypotheses.slice(-limit).map(h => <HypothesisComparison key={h.id} profile={profile} hypothesis={h} edit={edit} saved={saveStatus.phase === 'saved'} />)}
    <h3>Retained derivations</h3>
    <p className="dim">Save a symbolic translation to retain its rules, lexical steps, meaning trees and unresolved alternatives. Changed dependencies mark it stale; rerun to record a new result.</p>
    {profile.research.analyses.slice(-limit).reverse().map(a => {
      const reasons = staleReasons(profile, a)
      return <details key={a.id}><summary>{a.source} · {a.result.status} · {reasons.length ? 'stale' : 'current'} · revision {a.profile_revision}</summary>
        <SuppliedTargetCheck run={a} />
        {reasons.map(reason => <p key={reason}>{reason}</p>)}
        {a.result.candidates.map((c, i) => <div key={i}><p>Rules: {c.ruleIds.join(', ') || 'lexical phrase only'}</p>
          <ol>{c.steps.map((s, j) => <li key={j}>{s.operation}: “{s.text}” [{s.start}, {s.end}) · {s.ruleId ?? s.entryId}</li>)}</ol>
          <details><summary>Meaning tree</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(c.tree, null, 2)}</pre></details></div>)}
        {a.result.diagnostics.map((d, i) => <p key={i}>{d}</p>)}
      </details>
    })}
    <h3>Evidence count history</h3>
    {profile.research.metrics.slice(-limit).reverse().map(m => <p key={m.id}>{profile.research.hypotheses.find(h => h.id === m.hypothesis_id)?.label} · support {m.supports}, contradiction {m.contradicts}, ambiguous {m.ambiguous} · revision {m.profile_revision} · {staleReasons(profile, m).length ? 'stale' : 'current'}</p>)}
    <button className="btn sm ghost" onClick={() => setLimit(n => n + 20)}>Show more history (latest {limit} per collection)</button>
  </section>
}

function ObservationEditor({ observation: o }: { observation: Observation }) {
  const { profile, editResearch } = useProfile()
  const [interpretation, setInterpretation] = useState(''), [reason, setReason] = useState(''), [error, setError] = useState('')
  if (!profile) return null
  const r = profile.research
  const correct = () => {
    try { editResearch(profile.id, r => {
      const previous = latestAnnotation(r, o.id)
      return { ...r, annotations: [...r.annotations, { ...recordIdentity(), observation_id: o.id,
        revision: (previous?.revision ?? 0) + 1, supersedes: previous?.id ?? null, interpretation, provenance: 'user' }] }
    }); setInterpretation(''); setError('') } catch (e) { setError((e as Error).message) }
  }
  return <details aria-label={`Observation ${o.text}`} style={{ marginTop: 10 }}><summary>“{o.text}” · {withdrawn(r, o.id) ? 'withdrawn' : 'captured'}</summary>
    <p>{o.source} · {o.origin} · {o.created_at}</p>
    <p className="dim" style={{ overflowWrap: 'anywhere' }}>SHA-256: {o.content_sha256}</p>
    {r.annotations.filter(a => a.observation_id === o.id).map(a => <p key={a.id}>Interpretation revision {a.revision}: {a.interpretation}</p>)}
    <label>Revised interpretation<input value={interpretation} maxLength={8192} onChange={e => setInterpretation(e.target.value)} /></label>
    <button className="btn sm" disabled={!interpretation.trim()} onClick={correct}>Append interpretation</button>
    <label>Withdrawal reason<input value={reason} maxLength={8192} onChange={e => setReason(e.target.value)} /></label>
    <button className="btn sm" disabled={!reason.trim() || withdrawn(r, o.id)} onClick={() => {
      try { editResearch(profile.id, r => ({ ...r, events: [...r.events, { ...recordIdentity(), kind: 'withdraw-observation', observation_id: o.id, reason }] })) }
      catch (e) { setError((e as Error).message) }
    }}>Withdraw evidence</button>
    {error && <p role="alert">{error}</p>}
  </details>
}

function SuppliedTargetCheck({ run }: { run: ResearchAnalysis }) {
  const { profile, editResearch } = useProfile()
  const [expected, setExpected] = useState(''), [error, setError] = useState('')
  if (!profile) return null
  return <div>
    <label>Expected English for this run<input maxLength={8192} value={expected} onChange={e => setExpected(e.target.value)} /></label>
    <button className="btn sm" disabled={!expected.trim()} onClick={() => {
      try { editResearch(profile.id, r => ({ ...r, tests: [...r.tests, { ...recordIdentity(), analysis_id: run.id, expected,
        outcome: checkSuppliedTarget(run, expected), definition: 'supplied-target-1' }] })); setError('') }
      catch (e) { setError((e as Error).message) }
    }}>Check supplied target</button>
    <p className="dim">This checks a user-supplied expectation against the retained result. It is not a blind evaluation.</p>
    {profile.research.tests.filter(t => t.analysis_id === run.id).map(t => <p key={t.id}>Expected “{t.expected}”: {t.outcome}</p>)}
    {error && <p role="alert">{error}</p>}
  </div>
}
