import { useCallback, useEffect, useRef, useState } from 'react'
import type { LanguageProfile } from 'shared/types'
import { elicitationReportSchema, type ElicitationRecord, type ElicitationState } from 'shared/schemas/elicitation-records'
import { useProfile } from '@/stores/profile-context'
import { getSaveQueue } from '@/stores/save-runtime'
import { useProfileDraft } from '@/hooks/useProfileDraft'
import { apiFetch } from '@/services/api'

export function DecisionFields({ record, disabled, decide }: { record: ElicitationRecord; disabled: boolean;
  decide: (action: 'answer' | 'decline', answer: string | null, reason: string) => Promise<boolean> }) {
  const [answer, setAnswer] = useProfileDraft<string>(`elicitation.answer.${record.id}`, '')
  const [reason, setReason] = useProfileDraft<string>(`elicitation.reason.${record.id}`, '')
  const submit = async (action: 'answer' | 'decline') => {
    await decide(action, action === 'answer' ? answer.trim() : null, reason.trim())
  }
  return <fieldset disabled={disabled} style={{ marginTop: 12 }}>
    <legend>Record your observation or decline</legend>
    <label>Observed form<input className="input" aria-label="Elicitation answer" maxLength={128} value={answer} onChange={e => setAnswer(e.target.value)} /></label>
    <label>Source or decision reason<textarea className="textarea" aria-label="Elicitation reason" maxLength={1200} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <div className="flex" style={{ gap: 8 }}>
      <button className="btn primary sm" disabled={!answer.trim() || !reason.trim()} onClick={() => void submit('answer')}>Save observed answer</button>
      <button className="btn sm" disabled={!reason.trim()} onClick={() => void submit('decline')}>Decline question</button>
    </div>
  </fieldset>
}
export function NextObservation() {
  const { profile, saveStatus } = useProfile(), id = profile!.id
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState('')
  const [states, setStates] = useState<{ revision: number; values: ElicitationState[] }>({ revision: -1, values: [] })
  const alive = useRef(true), creation = useRef<string | null>(null), intent = useRef<{ key: string; id: string } | null>(null)
  const refresh = useCallback(async () => {
    const response = await apiFetch<{ profile: LanguageProfile; states: ElicitationState[] }>(`/elicitation/${encodeURIComponent(id)}`)
    await getSaveQueue().load(response.profile)
    if (alive.current) setStates({ revision: response.profile.revision, values: response.states })
  }, [id])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { void refresh().catch(e => { if (alive.current) setError((e as Error).message) }) }, [refresh, profile?.revision])
  const records = profile?.elicitation_history ?? [], record = records.find(r => r.id === selected) ?? records.at(-1)
  const report = record ? elicitationReportSchema.parse(JSON.parse(record.report_json)) : null
  const after = record?.decision?.after_json ? elicitationReportSchema.parse(JSON.parse(record.decision.after_json)) : null
  const state = states.revision === profile?.revision ? states.values.find(s => s.id === record?.id) : undefined
  const saved = saveStatus.phase === 'saved' && saveStatus.durable
  const create = async () => {
    if (!saved || busy || !profile) return
    creation.current ??= crypto.randomUUID()
    setBusy(true); setError('')
    try {
      const response = await apiFetch<{ profile: LanguageProfile }>(`/elicitation/${encodeURIComponent(id)}`, { method: 'POST',
        body: JSON.stringify({ expectedRevision: profile.revision, mutationId: creation.current }) })
      await getSaveQueue().load(response.profile)
      if (alive.current) setSelected(response.profile.elicitation_history?.find(r => r.request_id === creation.current)?.id ?? '')
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
      const response = await apiFetch<{ profile: LanguageProfile }>(`/elicitation/${encodeURIComponent(id)}/${encodeURIComponent(record.id)}/decision`, { method: 'POST',
        body: JSON.stringify({ expectedRevision: profile.revision, mutationId: intent.current.id, action, answer, reason }) })
      const queue = getSaveQueue()
      await queue.load(response.profile)
      // A delayed response may arrive after navigation; clear only the originating project's drafts.
      queue.setDraft(id, `elicitation.answer.${record.id}`, '')
      queue.setDraft(id, `elicitation.reason.${record.id}`, '')
      intent.current = null; return true
    } catch (e) { if (alive.current) setError((e as Error).message); return false }
    finally { try { await refresh() } catch (e) { if (alive.current) setError((e as Error).message) }; if (alive.current) setBusy(false) }
  }
  return <section aria-label="Active number elicitation" className="glass-card" style={{ padding: 18 }}>
    <h3>Choose a distinguishing observation</h3>
    <p>Compare the predicted forms of integers 1–64 under the leading number grammars. Questions use equal cost and uniform candidate weights, not calibrated confidence.</p>
    <p className="dim">Only your observed answer becomes validation evidence. Declining excludes that numeral while the number evidence remains unchanged.</p>
    {!saved && <p role="status">Finish or resolve pending saves before selecting or answering.</p>}
    {error && <p role="alert">{error}</p>}
    <button className="btn primary sm" disabled={!saved || busy || records.length >= 20} onClick={() => void create()}>{busy ? 'Saving elicitation…' : 'Select and record next question'}</button>
    <button className="btn sm" disabled={busy} onClick={() => void refresh().catch(e => setError((e as Error).message))}>Refresh question history</button>
    <p className="dim">{records.length}/20 retained questions. This bounded history is never silently pruned.</p>
    <div aria-label="Elicitation history">{records.map(r => <button className="btn sm" key={r.id} disabled={busy} onClick={() => setSelected(r.id)}>
      Question {records.indexOf(r) + 1} · {r.decision?.action ?? 'recorded'}
    </button>)}</div>
    {record && report && <article aria-label="Selected elicitation" style={{ marginTop: 12, overflowWrap: 'anywhere' }}>
      <p>{report.inferenceStatus} · {report.inferenceReason}</p>
      <p>{report.leaderIds.length} leading candidates; {report.eligible}/{report.considered} eligible questions; {report.unavailable} questions have unavailable predictions.</p>
      {report.selection ? <>
        <h4>Observed form requested for integer {report.selection.value}</h4>
        <p>Uniform disagreement: {report.selection.disagreementBits.toFixed(3)} bits. Expected remaining candidates under these weights: {report.selection.expectedRemaining.toFixed(2)}.</p>
        <ul>{report.selection.groups.map(g => <li key={g.form}><strong>{g.form}</strong> · {g.candidateIds.length} candidate(s)<details><summary>Candidate identities</summary>{g.candidateIds.join(', ')}</details></li>)}</ul>
      </> : <p>{report.reason}</p>}
      {record.archived && <p>Historical question restored from an archive. Select a new question to act in this project.</p>}
      {state?.stale && !record.decision && <p role="status">Number evidence changed or this question was restored. Select a new question before answering.</p>}
      {record.decision ? <>
        <p>Recorded decision: {record.decision.action}{record.decision.answer ? ` · ${record.decision.answer}` : ''}</p><p>{record.decision.reason}</p>
        {after && <p>After the answer: {after.leaderIds.length} leading candidates (before {report.leaderIds.length}); {after.validationCount} validation observations. {after.inferenceReason}</p>}
        {record.decision.action === 'decline' && <p>No linguistic evidence was changed.</p>}
      </> : report.selection && <DecisionFields key={record.id} record={record} disabled={busy || !saved || !state?.canDecide} decide={decide} />}
      <details><summary>Selection and input record</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify({ source: JSON.parse(record.source_json), report, after }, null, 2)}</pre></details>
    </article>}
  </section>
}
