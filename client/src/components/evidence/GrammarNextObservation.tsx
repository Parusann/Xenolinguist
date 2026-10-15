import { useCallback, useEffect, useRef, useState } from 'react'
import type { LanguageProfile } from 'shared/types'
import type { ElicitationState } from 'shared/schemas/elicitation-records'
import { grammarSetupSchema } from 'shared/schemas/grammar-elicitation'
import type { GrammarSessionReport } from 'engine/elicitation/grammar-session'
import { useProfile } from '@/stores/profile-context'
import { getSaveQueue } from '@/stores/save-runtime'
import { useProfileDraft } from '@/hooks/useProfileDraft'
import { apiFetch } from '@/services/api'
import { DecisionFields } from './NextObservation'
import { GrammarGrounding } from './GrammarGrounding'
import { grammarDraftSchema, initialGrammarSetup, meaningLabel } from './grammar-grounding'

export function GrammarNextObservation() {
  const { profile, saveStatus } = useProfile(), id = profile!.id
  const [stored, setStored] = useProfileDraft<string>('grammar.elicitation.setup', JSON.stringify(initialGrammarSetup))
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState('')
  const [states, setStates] = useState<{ revision: number; values: ElicitationState[] }>({ revision: -1, values: [] })
  const alive = useRef(true), creation = useRef<{ key: string; id: string } | null>(null), intent = useRef<{ key: string; id: string } | null>(null)
  const refresh = useCallback(async () => {
    const response = await apiFetch<{ profile: LanguageProfile; states: ElicitationState[] }>(`/grammar-elicitation/${encodeURIComponent(id)}`)
    await getSaveQueue().load(response.profile)
    if (alive.current) setStates({ revision: response.profile.revision, values: response.states })
  }, [id])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { void refresh().catch(e => { if (alive.current) setError((e as Error).message) }) }, [refresh, profile?.revision])
  let setup = initialGrammarSetup as ReturnType<typeof grammarDraftSchema.parse>, draftError = ''
  try { setup = grammarDraftSchema.parse(JSON.parse(stored)) } catch { draftError = 'The stored setup is invalid. Its original draft is retained; reset only if you want to discard it.' }
  const records = profile?.grammar_elicitation_history ?? [], record = records.find(r => r.id === selected) ?? records.at(-1)
  const report: GrammarSessionReport | null = record ? JSON.parse(record.report_json) : null
  const after: GrammarSessionReport | null = record?.decision?.after_json ? JSON.parse(record.decision.after_json) : null
  const state = states.revision === profile?.revision ? states.values.find(s => s.id === record?.id) : undefined
  const saved = saveStatus.phase === 'saved' && saveStatus.durable
  const create = async () => {
    if (!saved || busy || !profile) return
    setBusy(true); setError('')
    try {
      if (draftError) throw Error(draftError)
      const value = grammarSetupSchema.parse(setup), key = JSON.stringify(value)
      if (creation.current?.key !== key) creation.current = { key, id: crypto.randomUUID() }
      const requestId = creation.current.id
      const response = await apiFetch<{ profile: LanguageProfile }>(`/grammar-elicitation/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ expectedRevision: profile.revision, mutationId: requestId, setup: value }) })
      await getSaveQueue().load(response.profile)
      if (alive.current) setSelected(response.profile.grammar_elicitation_history?.find(r => r.request_id === requestId)?.id ?? '')
      creation.current = null
    } catch (e) { if (alive.current) setError((e as Error).message) }
    finally { try { await refresh() } catch (e) { if (alive.current) setError((e as Error).message) }; if (alive.current) setBusy(false) }
  }
  const decide = async (action: 'answer' | 'decline', answer: string | null, reason: string) => {
    if (!saved || busy || !record || !profile || !state?.canDecide) return false
    const key = JSON.stringify([record.id, action, answer, reason])
    if (intent.current?.key !== key) intent.current = { key, id: crypto.randomUUID() }
    setBusy(true); setError('')
    try {
      const response = await apiFetch<{ profile: LanguageProfile }>(`/grammar-elicitation/${encodeURIComponent(id)}/${encodeURIComponent(record.id)}/decision`, { method: 'POST', body: JSON.stringify({ expectedRevision: profile.revision, mutationId: intent.current.id, action, answer, reason }) })
      const queue = getSaveQueue(); await queue.load(response.profile)
      queue.setDraft(id, `elicitation.answer.${record.id}`, ''); queue.setDraft(id, `elicitation.reason.${record.id}`, '')
      intent.current = null; return true
    } catch (e) { if (alive.current) setError((e as Error).message); return false }
    finally { try { await refresh() } catch (e) { if (alive.current) setError((e as Error).message) }; if (alive.current) setBusy(false) }
  }
  return <section aria-label="Active grammar elicitation" className="glass-card" style={{ padding: 16, overflowWrap: 'anywhere' }}>
    <h2 style={{ fontSize: 18 }}>Ask about competing grammars</h2>
    <p>Ground a meaning you can observe and compare complete alternative rule sets. Uniform candidate disagreement per cost is a heuristic, not calibrated confidence.</p>
    <details><summary>Configure alternatives and answerable meanings</summary>
      {draftError ? <p role="alert">{draftError}</p> : <GrammarGrounding profile={profile!} setup={setup} disabled={busy} change={v => setStored(JSON.stringify(v))} />}
      <button className="btn sm" disabled={busy} onClick={() => setStored(JSON.stringify(initialGrammarSetup))}>Reset question setup</button>
    </details>
    {!saved && <p role="status">Finish or resolve pending saves before selecting or answering.</p>}
    {error && <p role="alert">{error}</p>}
    <button className="btn primary sm" disabled={!saved || busy || !!draftError || !grammarSetupSchema.safeParse(setup).success || records.length >= 20} onClick={() => void create()}>Select and record grammar question</button>
    <button className="btn sm" disabled={busy} onClick={() => void refresh().catch(e => setError((e as Error).message))}>Refresh grammar history</button>
    <p className="dim">{records.length}/20 retained grammar questions. History is never silently pruned.</p>
    {records.map((r, i) => <button className="btn xs" key={r.id} disabled={busy} onClick={() => setSelected(r.id)}>Grammar question {i + 1} · {r.decision?.action ?? 'recorded'}</button>)}
    {record && report && <article>
      <p>{report.remaining.length} remaining alternatives · {report.evidenceCount} recorded answers · {report.eligible}/{report.considered} eligible questions · {report.unavailable} with unavailable predictions.</p>
      {report.selection?.meaning ? <>
        <h3>Observe: {meaningLabel(report.selection.meaning)}</h3>
        <p>Disagreement {report.selection.disagreementBits?.toFixed(3)} bits · declared cost {report.selection.cost} · expected remaining {report.selection.expectedRemaining?.toFixed(2)}.</p>
        <ul>{report.selection.groups.map(g => <li key={g.form}>{g.form} · alternatives {g.candidateIds.join(', ')}</li>)}</ul>
      </> : <p>{report.reason}</p>}
      <ul>{report.scores.map(c => <li key={c.id}>Alternative {c.id}: {c.matches} matches, {c.contradictions} contradictions, {c.unavailable} unresolved{c.aliases.length ? `; equivalent alternatives ${c.aliases.join(', ')}` : ''}.</li>)}</ul>
      {record.archived && <p>Historical grammar question restored from an archive. Configure a new comparison to continue.</p>}
      {state?.stale && !record.decision && <p role="status">Grounding or evidence changed. Select a new grammar question before answering.</p>}
      {record.decision ? <><p>Recorded decision: {record.decision.action}{record.decision.answer ? ` · ${record.decision.answer}` : ''}</p><p>{record.decision.reason}</p>
        {after && <p>After the answer: {after.remaining.length} remaining alternatives (before {report.remaining.length}); {after.evidenceCount} recorded answers. No rule was automatically accepted.</p>}
        {record.decision.action === 'decline' && <p>No linguistic evidence was changed.</p>}
      </> : report.selection && <DecisionFields key={record.id} record={record} disabled={busy || !saved || !state?.canDecide} decide={decide} />}
      <details><summary>Grammar selection and input record</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify({ source: JSON.parse(record.source_json), report, after }, null, 2)}</pre></details>
    </article>}
  </section>
}
