import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/services/api'
import { useProfile } from '@/stores/profile-context'
import { useOllama } from '@/stores/ollama-context'
import { getSaveQueue } from '@/stores/save-runtime'
import type { LanguageProfile } from 'shared/types'
import type { ProposalReviewState } from 'shared/schemas/proposal-reviews'
import { proposalRunSchema } from 'shared/schemas/proposals'

type ReviewResponse = { profile: LanguageProfile; states: ProposalReviewState[] }
export function ProposalReview() {
  const { profile, saveStatus } = useProfile(), { selectedModel, ready } = useOllama()
  const id = profile!.id
  const [query, setQuery] = useState(''), [sampleIds, setSampleIds] = useState<string[]>([]), [states, setStates] = useState<ProposalReviewState[]>([])
  const [statesRevision, setStatesRevision] = useState(-1)
  const [selected, setSelected] = useState(''), [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null), alive = useRef(true)
  const intent = useRef<{ key: string; id: string } | null>(null)
  const refresh = useCallback(async () => {
    const data = await apiFetch<ReviewResponse>(`/ai/research/runs/${encodeURIComponent(id)}`)
    await getSaveQueue().load(data.profile)
    if (alive.current) { setStates(data.states); setStatesRevision(data.profile.revision) }
  }, [id])
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; controller.current?.abort() }
  }, [refresh])
  useEffect(() => {
    void refresh().catch(e => { if (alive.current) setError((e as Error).message) })
  }, [refresh, profile?.revision])
  const records = profile?.proposal_reviews ?? [], record = records.find(r => r.id === selected) ?? records.at(-1)
  const run = record?.run_json ? proposalRunSchema.parse(JSON.parse(record.run_json)) : null
  const state = statesRevision === profile?.revision ? states.find(s => s.id === record?.id) : undefined
  const saved = saveStatus.phase === 'saved' && saveStatus.durable
  const generate = async () => {
    if (!profile || !saved || busy) return
    const abort = new AbortController(); controller.current = abort; setBusy(true); setError('')
    try {
      const response = await apiFetch<{ profile: LanguageProfile; reviewId: string }>('/ai/research/runs', { method: 'POST',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(190000)]), body: JSON.stringify({ profile_id: id, expectedRevision: profile.revision,
          model: selectedModel, query, validation_sample_ids: sampleIds }) })
      await getSaveQueue().load(response.profile)
      if (alive.current) { setSelected(response.reviewId); setReason('') }
    } catch (e) { if (alive.current) setError(abort.signal.aborted ? 'Generation cancelled. Its retained record will show the outcome.' : (e as Error).message) }
    finally {
      controller.current = null
      try { await refresh() } catch (e) { if (alive.current) setError((e as Error).message) }
      if (alive.current) setBusy(false)
    }
  }
  const decide = async (action: 'accept' | 'reject') => {
    if (!record || !profile || busy || !saved || !reason.trim()) return
    const key = JSON.stringify([record.id, action, reason.trim()])
    if (intent.current?.key !== key) intent.current = { key, id: crypto.randomUUID() }
    setBusy(true); setError('')
    try {
      const response = await apiFetch<{ profile: LanguageProfile }>(`/ai/research/runs/${encodeURIComponent(id)}/${encodeURIComponent(record.id)}/decision`, {
        method: 'POST', body: JSON.stringify({ expectedRevision: profile.revision, mutationId: intent.current.id, action, reason: reason.trim() }) })
      await getSaveQueue().load(response.profile)
      intent.current = null
    } catch (e) { if (alive.current) setError((e as Error).message) }
    finally { try { await refresh() } catch (e) { if (alive.current) setError((e as Error).message) }; if (alive.current) setBusy(false) }
  }
  const remove = async () => {
    if (!record || !profile || busy || !saved) return
    setBusy(true); setError('')
    try {
      const response = await apiFetch<{ profile: LanguageProfile }>(`/ai/research/runs/${encodeURIComponent(id)}/${encodeURIComponent(record.id)}`, {
        method: 'DELETE', body: JSON.stringify({ expectedRevision: profile.revision }) })
      await getSaveQueue().load(response.profile)
      if (alive.current) setSelected('')
    } catch (e) { if (alive.current) setError((e as Error).message) }
    finally { try { await refresh() } catch (e) { if (alive.current) setError((e as Error).message) }; if (alive.current) setBusy(false) }
  }
  return <section aria-label="Research proposal review" style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
    <h3>Research proposals</h3>
    <p className="dim">Inspect cited evidence and executable checks before applying a change. Compatibility with your selected targets is not proof or calibrated confidence.</p>
    {!saved && <p role="status">Finish or resolve pending saves before generating or deciding.</p>}
    {error && <p role="alert">{error}</p>}
    <label>Research question<textarea className="textarea" aria-label="Research question" value={query} maxLength={1200} disabled={busy} onChange={e => setQuery(e.target.value)} /></label>
    <fieldset style={{ margin: '12px 0', padding: 10, border: '1px solid var(--border)' }} disabled={busy}>
      <legend>Validation samples (up to 12)</legend>
      <p className="dim">These supplied targets are visible to the model. No selection means an inconclusive linguistic check.</p>
      {profile?.samples.filter(s => s.english_translation?.trim()).map(s => <label key={s.id} style={{ display: 'block', marginBottom: 8, overflowWrap: 'anywhere' }}>
        <input type="checkbox" aria-label={`Check sample ${s.alien_text}`} checked={sampleIds.includes(s.id)}
          disabled={!sampleIds.includes(s.id) && sampleIds.length >= 12} onChange={e => setSampleIds(ids => e.target.checked ? [...ids, s.id] : ids.filter(id => id !== s.id))} /> {s.alien_text} → {s.english_translation}
      </label>)}
    </fieldset>
    <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
      <button className="btn primary sm" disabled={!ready || !saved || busy || !query.trim() || !profile?.research.observations.length} onClick={() => void generate()}>Generate research proposal</button>
      {busy && controller.current && <button className="btn sm" onClick={() => controller.current?.abort()}>Cancel proposal generation</button>}
      <button className="btn sm" disabled={busy} onClick={() => void refresh().catch(e => setError((e as Error).message))}>Refresh proposal records</button>
    </div>
    {!profile?.research.observations.length && <p className="dim">Capture an observation in Field Log first so proposals can cite retained evidence.</p>}
    <p className="dim">{records.length}/20 retained runs. Inputs, completed results and decisions stay with this project and its archive. Interrupted work is not resumed automatically.</p>
    <div aria-label="Retained proposals">{records.map(r => <button className="btn sm" key={r.id} style={{ display: 'block', marginBottom: 6, maxWidth: '100%', whiteSpace: 'normal' }}
      onClick={() => { setSelected(r.id); setReason(''); intent.current = null }} disabled={busy}>
      {r.request.query.slice(0, 75)} · {r.decision?.action ?? states.find(s => s.id === r.id)?.status ?? r.status}
    </button>)}</div>
    {record && <article aria-label="Selected proposal" style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12, overflowWrap: 'anywhere' }}>
      <p>Generation: {state?.status ?? record.status}{record.decision ? ` · Decision: ${record.decision.action}` : ''}</p>
      {record.archived && <p className="dim">Historical review restored from an archive. Cited identities refer to its original input snapshot; generate a new proposal to apply a change here.</p>}
      {record.error && <p role="status">{record.error.code}: {record.error.message}</p>}
      {state?.status === 'interrupted' && <p>Execution stopped before a complete result was saved. Generate a new run when ready.</p>}
      {state?.stale && !record.decision && <p role="status">Inputs changed or this review was restored from an archive. Generate a new proposal before accepting.</p>}
      {!record.decision && state?.acceptBlockReason && <p className="dim">{state.acceptBlockReason}</p>}
      {run && <>
        <h4>{run.proposal.label}</h4><p>{run.proposal.explanation}</p>
        <p><strong>Validation: {run.validation.status}</strong></p>
        {run.validation.errors.map((e, i) => <p key={i}>{e}</p>)}
        <h4>Changes on acceptance</h4><ul>{run.validation.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        <p className="dim">Accepted words/rules stay unrated. Acceptance records your decision and the model origin; it does not establish a fact.</p>
        <h4>Cited observations</h4>{run.proposal.citations.map((c, i) => <blockquote key={i}>
          <p>“{c.quote}”</p><p className="dim">{c.observation_id} · [{c.start}, {c.end}) · model suggests {c.relation} · interpretation {c.annotation_id ?? 'original'}</p>
        </blockquote>)}
        <h4>Deterministic checks</h4>{run.validation.checks.map(c => <div key={c.sample_id} style={{ marginBottom: 10 }}>
          <p>{c.source} → expected: {c.expected}</p><p>Before: {c.before.rendered ?? 'unresolved'} · {c.before.outcome}<br />After: {c.after.rendered ?? 'unresolved'} · {c.after.outcome}{c.regression ? ' · regression' : ''}</p>
        </div>)}
        <h4>Alternatives</h4><ul>{run.proposal.alternatives.map((a, i) => <li key={i}>{a}</li>)}</ul>
        <ul className="dim">{run.validation.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <details><summary>Model and experiment provenance</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify(run.provenance, null, 2)}</pre></details>
        {record.decision ? <p>Recorded reason: {record.decision.reason}</p> : <>
          <label>Decision reason<textarea className="textarea" aria-label="Proposal decision reason" value={reason} maxLength={1200} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
          <div className="flex" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn primary sm" disabled={busy || !saved || !state?.canAccept || !reason.trim()} onClick={() => void decide('accept')}>{run.proposal.content.kind === 'observation-request' ? 'Accept observation request' : 'Accept and apply proposal'}</button>
            <button className="btn sm" disabled={busy || !saved || !reason.trim()} onClick={() => void decide('reject')}>Reject proposal</button>
          </div>
        </>}
      </>}
      {record.decision?.action !== 'accept' && <div style={{ marginTop: 16 }}><button className="btn sm" disabled={busy || !saved || state?.status === 'running'} onClick={() => void remove()}>Delete this proposal record</button>
        <p className="dim">Removes this unaccepted run from the current project. Recovery snapshots and previous exports may retain it.</p></div>}
    </article>}
  </section>
}
