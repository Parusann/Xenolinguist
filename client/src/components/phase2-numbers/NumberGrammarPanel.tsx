import { useEffect, useRef, useState } from 'react'
import { describeNumberCandidate, describeNumberTree, predictConsensus, type nextNumberQuestion } from 'engine/numbers/predict'
import type { NumberInference } from 'engine/numbers/score'
import type { LanguageProfile } from 'shared/types'
import { useProfile } from '@/stores/profile-context'
import { useProfileDraft } from '@/hooks/useProfileDraft'

type WorkerResult = { inference: NumberInference; question: ReturnType<typeof nextNumberQuestion> }
export function NumberGrammarPanel({ profile }: { profile: LanguageProfile }) {
  const { updateProfile } = useProfile()
  const [target, setTarget] = useProfileDraft<string>('numbers.prediction', '13')
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<(WorkerResult & { fingerprint: string }) | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState('')
  const workerRef = useRef<Worker | null>(null), timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { workerRef.current?.terminate(); if (timerRef.current) clearTimeout(timerRef.current) }, [])
  const numberSystem = profile.number_system
  const mappings = Object.entries(numberSystem.mappings).filter(([, form]) => form.trim()).map(([value, form]) => ({ value: Number(value), form }))
  const validation = new Set((numberSystem.validation_values ?? []).filter(value => numberSystem.mappings[value]?.trim()))
  const caseSensitive = profile.lexical_policy?.caseSensitive ?? false
  const fingerprint = JSON.stringify({ mappings: numberSystem.mappings, validation: numberSystem.validation_values, caseSensitive })
  const stale = !!result && result.fingerprint !== fingerprint
  const cancel = () => { workerRef.current?.terminate(); workerRef.current = null; if (timerRef.current) clearTimeout(timerRef.current); setBusy(false) }
  const run = () => {
    cancel(); setResult(null); setError(''); setAnswer(''); setSelected(''); setBusy(true)
    const worker = new Worker(new URL('../../workers/numbers.worker.ts', import.meta.url), { type: 'module' }); workerRef.current = worker
    worker.onmessage = (event: MessageEvent<WorkerResult>) => { setResult({ ...event.data, fingerprint }); cancel() }
    worker.onerror = () => { setError('Number inference failed; your mappings are retained.'); cancel() }
    timerRef.current = setTimeout(() => { setError('Number inference exceeded 15 seconds. Reduce the mapping set.'); cancel() }, 15000)
    worker.postMessage({ fit: mappings.filter(o => !validation.has(o.value)), validation: mappings.filter(o => validation.has(o.value)), caseSensitive })
  }
  const value = /^(0|[1-9]\d*)$/.test(target) ? Number(target) : NaN
  const inference = !stale ? result?.inference : undefined
  const prediction = inference && Number.isInteger(value) && value <= 4095 ? predictConsensus(inference, value) : null
  const question = !stale ? result?.question : null
  const candidate = inference?.candidates.find(c => c.id === selected) ?? inference?.candidates[0]
  const saveAnswer = () => {
    if (!question || !answer.trim()) return
    updateProfile({ number_system: { ...numberSystem, mappings: { ...numberSystem.mappings, [question.value]: answer.trim() }, validation_values: [...new Set([...validation, question.value])] } })
    setAnswer('')
  }
  return <section aria-label="Number grammar inference" className="glass-card" style={{ padding: 18, minWidth: 0, overflowWrap: 'anywhere' }}>
    <h2 className="label">Number grammar inference</h2>
    <p className="dim">Compare repeated addition and multiplication with a remainder. Fit mappings supply atoms and linking rules; validation mappings test predictions. No candidate is a confirmed language or calibrated probability.</p>
    <details><summary>Choose independent validation mappings</summary>
      <p className="dim">Keep the primitive number words in fit. Hold out composed forms before inference. Repeatedly editing this selection makes it exploratory, not a blind evaluation.</p>
      {mappings.map(o => <label key={o.value} style={{ display: 'block' }}><input type="checkbox" aria-label={`Validate number ${o.value}`} checked={validation.has(o.value)} onChange={event => {
        const next = new Set(validation); if (event.target.checked) next.add(o.value); else next.delete(o.value)
        updateProfile({ number_system: { ...numberSystem, validation_values: [...next] } })
      }} /> {o.value} = {o.form}</label>)}
    </details>
    <div className="flex" style={{ gap: 8, marginTop: 12 }}>
      <button className="btn primary sm" onClick={run} disabled={busy}>{busy ? 'Inferring…' : 'Infer number grammar'}</button>
      {busy && <button className="btn sm" onClick={cancel}>Cancel number inference</button>}
    </div>
    {error && <p role="alert">{error}</p>}
    {stale && <p role="status">Mappings or validation changed. Run number inference again; previous predictions are stale.</p>}
    {inference && <div data-testid="number-inference-result">
      <p><strong>{inference.status}</strong> · {inference.reason}</p>
      <p>{inference.fitCount} fit / {inference.validationCount} validation mappings · {inference.enumerated} enumerated grammars · {inference.duplicatesRemoved} duplicate observations removed</p>
      {!!inference.candidates.length && <>
        <label className="label">Compare a candidate<select className="input" style={{ width: '100%', minWidth: 0 }} aria-label="Number grammar candidate" value={candidate?.id ?? ''} onChange={event => setSelected(event.target.value)}>
          {inference.candidates.map(c => <option key={c.id} value={c.id}>{inference.leaderIds.includes(c.id) ? 'Leading · ' : ''}{describeNumberCandidate(c)} · link {JSON.stringify(c.grammar.additionJoiner)}{c.grammar.kind === 'multiplicative' ? ` · ${c.grammar.multiplicationOrder} × link ${JSON.stringify(c.grammar.multiplicationJoiner)}` : ''} · fit {c.support}/{c.fit.filter(o => o.outcome !== 'atom').length} · validation {c.validationSupport}/{c.validation.length} · {c.complexityBytes} bytes</option>)}
        </select></label>
        {candidate && <p>Fit support: {candidate.support}; contradictions: {candidate.contradictions}. Validation support: {candidate.validationSupport}/{candidate.validation.length}; contradictions: {candidate.validationContradictions}. Missing predictions remain in the denominator. Atoms are stored evidence, not successful composition tests.</p>}
        {candidate && <details><summary>Inspect candidate evidence and ordering</summary>
          <p>Addition linker: {JSON.stringify(candidate.grammar.additionJoiner)}. Multiplication: {candidate.grammar.multiplicationOrder}; linker: {JSON.stringify(candidate.grammar.multiplicationJoiner)}. Complexity: {candidate.complexityBytes} serialized UTF-8 bytes; a display preference only.</p>
          <table style={{ width: '100%', tableLayout: 'fixed', textAlign: 'left', fontSize: 12 }}><thead><tr><th>Use / value</th><th>Observed</th><th>Productive form</th><th>Outcome</th></tr></thead><tbody>
            {(['fit', 'validation'] as const).flatMap(partition => candidate[partition].map(o => <tr key={`${partition}-${o.value}`}><td>{partition} / {o.value}</td><td>{o.observed}</td><td>{o.predicted ?? 'unavailable'}</td><td>{o.outcome}</td></tr>))}
          </tbody></table>
        </details>}
        <label className="label" style={{ marginTop: 12 }}>Predict an integer (0–4095)<input className="input" aria-label="Predict number" value={target} onChange={event => setTarget(event.target.value)} /></label>
        {!prediction && <p>Enter an integer from 0 to 4095.</p>}
        {numberSystem.mappings[value] && <p>Recorded form: <strong>{numberSystem.mappings[value]}</strong>. This is stored evidence, not a new prediction.</p>}
        {prediction && <div aria-label="Number prediction" role="region"><p>{prediction.status === 'predicted' ? 'All leading grammars agree' : prediction.status === 'ambiguous' ? 'Leading grammars disagree' : 'No complete consensus'}; {prediction.unavailable} leading grammars cannot compose this value.</p>
          {!!prediction.failures.length && <details><summary>Why a prediction is unavailable</summary>{prediction.failures.map(failure => <p key={failure.candidateId}>{failure.candidateId}: {failure.status} — {failure.reason}</p>)}</details>}
          {prediction.variants.map(variant => <div key={variant.form}><strong>{variant.form}</strong> · {variant.candidateIds.length} candidate(s)<details><summary>Composition tree</summary><p>{describeNumberTree(variant.tree)}</p><details><summary>Structured derivation (JSON)</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(variant.tree, null, 2)}</pre></details></details></div>)}
        </div>}
      </>}
      {question && <div role="region" aria-label="Number question" style={{ marginTop: 16 }}><h3>Next useful observation: {question.value}</h3>
        <p>Leading grammars disagree: {question.variants.map(v => v.form).join(' / ')}. Supply an independently observed form; no suggested answer is saved automatically.</p>
        <label className="label">Observed answer<input className="input" aria-label="Observed number answer" maxLength={128} value={answer} onChange={event => setAnswer(event.target.value)} /></label>
        <button className="btn sm" disabled={!answer.trim() || validation.size >= 64} onClick={saveAnswer}>Save answer as validation</button>
      </div>}
      {!question && inference.leaderIds.length > 1 && <p>No fully answerable disagreement found among unmapped integers 1–512. The bounded search does not prove equivalent grammars.</p>}
    </div>}
  </section>
}
