import { useProfile } from '@/stores/profile-context'
import { SpeakButton } from '@/components/audio/SpeakButton'
import { dispatchSandbox, resetSandbox } from '@/stores/sandbox-session'
import { canAdvance, challengeProgress, sandboxStats, type SandboxAction } from 'shared/sandbox/session'
import type { SandboxChallenge } from 'shared/schemas/sandbox'

export function SandboxController() {
  const { profile } = useProfile()
  const session = profile?.sandbox_session
  if (!profile || !session) return null
  const send = (action: SandboxAction) => dispatchSandbox(profile.id, session.id, action)
  const stats = sandboxStats(session)
  const headings = ['Number discovery', 'Vocabulary mapping', 'Sentence practice', 'Grammar review']
  const kinds = ['number', 'vocabulary', 'sentence', 'grammar'] as const
  const kind = kinds[session.step - 1]
  const challenges = session.challenges.filter(c => c.kind === kind)
  const visible = kind === 'number' ? challenges.slice(0, session.visibleNumbers) : kind === 'vocabulary'
    ? challenges.slice(0, session.visibleVocabulary) : kind === 'sentence' ? challenges.slice(session.sentenceIndex, session.sentenceIndex + 1) : challenges

  const renderChallenge = (challenge: SandboxChallenge) => {
    const progress = challengeProgress(session, challenge.id)
    const guess = session.guesses[challenge.id] ?? ''
    const sentence = challenge.kind === 'sentence'
    return <div key={challenge.id} className="glass-inner rounded-xl p-5 space-y-3" data-challenge={challenge.id}>
      <div className="flex items-center gap-3">
        <h3 className="font-mono text-lg text-accent">{challenge.prompt}</h3>
        {challenge.kind !== 'grammar' && <SpeakButton text={challenge.prompt} />}
      </div>
      {challenge.kind !== 'grammar' && <div className="flex gap-2">
        <input className="input flex-1" aria-label={`Answer for ${challenge.prompt}`} maxLength={2000}
          placeholder={challenge.kind === 'number' ? 'Your guess...' : sentence ? 'Your translation...' : 'Meaning?'}
          value={guess} disabled={progress.solved || session.completed}
          onChange={event => send({ type: 'guess', challengeId: challenge.id, value: event.target.value })}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); send({ type: 'check', challengeId: challenge.id }) } }} />
        <button className="btn sm primary" disabled={!guess.trim() || progress.solved || session.completed}
          onClick={() => send({ type: 'check', challengeId: challenge.id })}>Check</button>
      </div>}
      {progress.revealed ? <p className="text-sm text-amber-300">Revealed: {challenge.accepted[0]} · excluded from unaided accuracy</p>
        : progress.matched ? <p role="status" className="text-sm text-accent">Matched{progress.last?.assisted ? ' with assistance' : ''}</p>
        : progress.last ? <p role="status" className="text-sm text-amber-300">Not matched. {sentence ? 'This checks accepted strings, so an unlisted paraphrase may still be valid.' : 'Use a complete accepted answer.'}</p> : null}
      {!progress.solved && <div className="flex gap-2">
        {challenge.kind !== 'grammar' && <button className="btn sm ghost" disabled={progress.hints >= 2 || session.completed}
          onClick={() => send({ type: 'hint', challengeId: challenge.id })}>Hint</button>}
        <button className="btn sm ghost" disabled={session.completed} onClick={() => send({ type: 'reveal', challengeId: challenge.id })}>
          {challenge.kind === 'grammar' ? 'Reveal rule' : 'Reveal answer'}</button>
      </div>}
      {progress.hints > 0 && !progress.solved && <p className="text-xs text-gray-400">
        {progress.hints === 1 ? (challenge.kind === 'number' ? 'Enter a complete integer, without units or decimals.' : 'Use the complete meaning; partial words do not count.')
          : `The accepted answer begins with “${Array.from(challenge.accepted[0])[0]}”.`}
      </p>}
      {sentence && <>
        <button className="btn sm ghost" onClick={() => send({ type: 'word-mode', challengeId: challenge.id })}>
          {session.wordMode.includes(challenge.id) ? 'Hide word-by-word help' : 'Word-by-word help'}</button>
        {session.wordMode.includes(challenge.id) && <div className="space-y-3">
          <p className="text-xs text-gray-400">Word-by-word practice is assistance and does not add separate accuracy credit.</p>
          {session.challenges.filter(c => c.parentId === challenge.id).map(renderToken)}
        </div>}
      </>}
    </div>
  }
  function renderToken(challenge: SandboxChallenge) { return renderChallenge(challenge) }

  return <div className="space-y-5 max-w-4xl mx-auto">
    <header className="space-y-2">
      <h1 className="text-2xl text-white">{session.conlang.language_name} · {session.completed ? 'Practice complete' : 'Sandbox practice'}</h1>
      <p className="text-sm text-gray-400">Generated language practice · grading v{session.gradingVersion}. The saved answer key supports recovery; this is not a blind linguistic benchmark.</p>
      <p className="text-xs text-gray-400">First-attempt unaided matches: {stats.unaidedFirst}/{stats.attempted} attempted challenges · {stats.total} total challenges</p>
      <p className="text-xs text-gray-400">Retries: {stats.retries} · Hints: {stats.hints} · Reveals: {stats.revealed} · Resolved: {stats.solved}/{stats.total}</p>
    </header>
    {session.completed ? <div className="glass-card rounded-xl p-6 space-y-4">
      <p>Practice completed. Hinted, retried and revealed answers remain separate from first-attempt unaided matches.</p>
      <p className="text-sm text-gray-400">Starting another session replaces this practice key and progress. Existing vocabulary, samples and grammar stay in the workspace.</p>
      <button className="btn primary" onClick={() => resetSandbox(profile.id)}>Play Again</button>
    </div> : <>
      <nav className="flex gap-2" aria-label="Sandbox steps">
        {headings.map((heading, index) => <button key={heading} className="btn sm ghost" disabled={index + 1 > session.step}
          aria-current={index + 1 === session.step ? 'step' : undefined} onClick={() => send({ type: 'step', value: index + 1 })}>{index + 1}. {heading}</button>)}
      </nav>
      <h2 className="text-lg">{headings[session.step - 1]}</h2>
      {kind === 'sentence' && <p className="text-sm text-gray-400">Match a conservative accepted translation. An unmatched paraphrase is not a semantic judgment.</p>}
      <div className="space-y-4">{visible.map(renderChallenge)}</div>
      {kind === 'sentence' && <div className="flex items-center gap-3">
        <button className="btn sm ghost" disabled={session.sentenceIndex === 0} onClick={() => send({ type: 'sentence', value: session.sentenceIndex - 1 })}>Previous sentence</button>
        <span>{session.sentenceIndex + 1}/{challenges.length}</span>
        <button className="btn sm ghost" disabled={session.sentenceIndex === challenges.length - 1} onClick={() => send({ type: 'sentence', value: session.sentenceIndex + 1 })}>Next sentence</button>
      </div>}
      {(kind === 'number' || kind === 'vocabulary') && visible.length < challenges.length && <button className="btn ghost" onClick={() => send({ type: 'more', kind })}>Show more</button>}
      {session.step < 4 ? <button className="btn primary" disabled={!canAdvance(session)} onClick={() => send({ type: 'step', value: session.step + 1 })}>
        {session.step === 1 ? 'Continue to Vocabulary' : session.step === 2 ? 'Continue to Sentences' : 'Continue to Grammar'}</button>
        : <button className="btn primary" disabled={!canAdvance(session)} onClick={() => send({ type: 'complete' })}>Finish practice</button>}
    </>}
  </div>
}
