import { useEffect, useRef, useState } from 'react'
import { useProfile } from '@/stores/profile-context'
import { apiFetch } from '@/services/api'
import type { CompilerView } from 'shared/schemas/sandbox'

export function CompilerSandbox() {
  const { profile, loadProfile, saveStatus, drafts, setDraft } = useProfile()
  const [view, setView] = useState<CompilerView | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const owner = profile?.id, snapshot = profile?.compiler_session_id
  useEffect(() => {
    const controller = new AbortController()
    if (owner) void apiFetch<CompilerView>(`/compiler/${owner}`, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setView(result)
    }).catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message) })
    return () => controller.abort()
  }, [owner, snapshot])
  if (!profile) return null
  const ready = !busy && saveStatus.phase === 'saved' && saveStatus.durable
  async function act(type: 'attempt' | 'reveal' | 'close', challengeId?: string, answer?: string) {
    if (!profile || !view || !ready) return
    setBusy(true); setError('')
    try {
      const result = await apiFetch<{ view: CompilerView | null }>(`/compiler/${profile.id}`, { method: 'POST', body: JSON.stringify({ type, challengeId, answer,
        sessionId: view.sessionId, expectedRevision: profile.revision, requestId: crypto.randomUUID() }) })
      if (mounted.current) { setView(result.view); await loadProfile(profile.id) }
    } catch (cause) {
      if (mounted.current) setError(`${(cause as Error).message}. Reload saved practice before retrying; your answer draft is retained.`)
    } finally { if (mounted.current) setBusy(false) }
  }
  return <section className="space-y-5 max-w-4xl mx-auto" aria-label="Validated compiler practice">
    <h1 className="text-2xl text-white">Validated compiler practice</h1>
    <p className="text-sm text-gray-400">Infer the language from grounded examples, then translate new combinations. The compiler checks its own semantic round trips. This exercise matches controlled English; it does not measure general language understanding.</p>
    {error && <div role="alert"><p>{error}</p><button className="btn sm ghost" disabled={busy} onClick={() => void loadProfile(profile.id).then(async () => {
      const result = await apiFetch<CompilerView>(`/compiler/${profile.id}`); if (mounted.current) { setView(result); setError('') }
    }).catch(cause => setError((cause as Error).message))}>Reload saved practice</button></div>}
    {!view ? <p role="status">Loading saved exercise…</p> : <>
      <p className="text-xs text-gray-400">{view.version} · First-attempt unaided matches: {view.feedback.filter(f => f.matched && f.attempts === 1 && !f.revealed && !f.assisted).length}/{view.feedback.filter(f => f.attempts > 0).length} attempted · Reveals: {view.feedback.filter(f => f.revealed).length}</p>
      <details className="glass-card p-5" open><summary>Grounded observations ({view.observations.length})</summary>
        <ol className="space-y-3 mt-3">{view.observations.map(o => <li key={o.id}><p className="font-mono text-accent">{o.utterance}</p><p>{o.english}</p></li>)}</ol>
      </details>
      <p>Use the examples’ English format: counts, adjectives, “does/do/did/will”, optional “not”, and the base verb. Unlisted paraphrases are not accepted.</p>
      <fieldset disabled={busy || saveStatus.phase !== 'saved' || Boolean(error)} className="space-y-4">
        <legend className="text-lg mb-3">Withheld compositions</legend>
        {view.challenges.map(c => {
          const feedback = view.feedback.find(f => f.challengeId === c.id)!, key = `compiler:${view.sessionId}:${c.id}`
          const answer = typeof drafts[key] === 'string' ? drafts[key] as string : feedback.lastAnswer ?? ''
          const resolved = feedback.matched || feedback.revealed
          return <div key={c.id} data-compiler-challenge={c.id} className="glass-inner rounded-xl p-5 space-y-3">
            <h2 className="font-mono text-accent">{c.utterance}</h2>
            <label className="block">Controlled English answer
              <input className="input w-full" maxLength={2000} value={answer} disabled={resolved} onChange={event => setDraft(key, event.target.value)} />
            </label>
            <div className="flex gap-2"><button className="btn primary sm" disabled={!ready || resolved || !answer.trim()} onClick={() => void act('attempt', c.id, answer)}>Check translation</button>
              <button className="btn ghost sm" disabled={!ready || resolved} onClick={() => void act('reveal', c.id)}>Reveal translation</button></div>
            {feedback.revealed ? <p role="status">Revealed: {feedback.answer} · excluded from unaided matches</p> : feedback.matched ? <p role="status">Matched{feedback.assisted ? ' after assistance' : ''}</p> : feedback.attempts > 0 ? <p role="status">Not matched. Check the complete controlled English form.</p> : null}
          </div>
        })}
        <button className="btn ghost" disabled={!ready} onClick={() => void act('close')}>End validated practice</button>
      </fieldset>
      {busy && <p role="status">Saving practice…</p>}
      {!ready && !busy && <p role="status">Finish or resolve pending project saves before submitting.</p>}
      <p className="text-xs text-gray-400">Submitted attempts and reveals are saved on this computer. To move this exercise, export a .xeno archive with sandbox answers and progress included. Ending practice removes the active exercise; export it first if you want to keep it.</p>
    </>}
  </section>
}
