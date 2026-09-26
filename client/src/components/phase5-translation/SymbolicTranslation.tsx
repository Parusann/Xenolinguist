import { EvidenceInspector } from '@/components/evidence/EvidenceInspector'
import { useProfile } from '@/stores/profile-context'
import { translationDependencies } from 'engine/evidence/dependencies'
import { recordIdentity } from '@/components/evidence/identity'
import { useMemo, useState } from 'react'
import { derive, type GrammarProfile } from 'engine/translation/derive'
import { renderEnglish } from 'engine/translation/render'
import { generate } from 'engine/morphology/generate'

export function SymbolicTranslation({ profile, source, label = 'Symbolic translation' }: { profile: GrammarProfile; source: string; label?: string }) {
  const { profile: savedProfile, editResearch, saveStatus } = useProfile()
  const canRecord = savedProfile && profile.dictionary === savedProfile.dictionary && profile.grammar_rules === savedProfile.grammar_rules
  const [recordError, setRecordError] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const result = useMemo(() => submitted !== null ? derive(submitted, profile) : null, [submitted, profile])
  return <section className="glass-inner" aria-label={label} style={{ padding: 12 }}>
    <div style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1, paddingBottom: 4 }}>
    <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
      <span className="label" style={{ margin: 0 }}>{label}</span>
      <button className="btn sm" disabled={!source.trim()} onClick={() => setSubmitted(source)}>Analyze symbolically</button>
    </div>
    <p className="dim" style={{ fontSize: 12 }}>Typed rules only · one clause or noun phrase · no model fallback. Set verb argument frames in Vocabulary. English uses explicit auxiliaries.</p>
    </div>
    {result && <div data-testid="symbolic-result">
      {canRecord && <button className="btn sm" disabled={saveStatus.phase !== 'saved' || submitted !== source} onClick={() => {
        try {
          const run = { ...recordIdentity(), engine_version: 'typed-grammar-1' as const, profile_revision: savedProfile.revision,
            source: submitted!, dependencies: translationDependencies(savedProfile), result: derive(submitted!, savedProfile) }
          editResearch(savedProfile.id, r => ({ ...r, analyses: [...r.analyses, run] })); setRecordError('')
        } catch (e) { setRecordError((e as Error).message) }
      }}>Save derivation to research</button>}
      {recordError && <p role="alert">{recordError}</p>}
      {submitted !== source && <p role="status">Source changed. Run the analysis again.</p>}
      <p role="status">{result.status} · {result.candidates.length} derivations · {result.operations} operations</p>
      {result.diagnostics.map((message, i) => <p key={i}>{message}</p>)}
      {result.candidates.map((candidate, i) => {
        const english = renderEnglish(candidate.tree)
        const generated = generate(candidate.tree, profile)
        return <details key={i} open={result.candidates.length === 1} style={{ marginTop: 10 }}>
          <summary>{english.status === 'rendered' ? english.text : `English unresolved: ${english.reason}`}</summary>
          <p className="dim">Rules: {candidate.ruleIds.join(', ') || 'lexical phrase only'}</p>
          {savedProfile && [...new Set([...candidate.ruleIds, ...candidate.steps.flatMap(step => step.entryId ? [step.entryId] : [])])].map(id =>
            <details key={id}><summary>Evidence for {id}</summary><EvidenceInspector profile={savedProfile} targetId={id} /></details>)}
          <details><summary>Meaning tree</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(candidate.tree, null, 2)}</pre></details>
          <ol style={{ paddingLeft: 20, fontSize: 12 }}>{candidate.steps.map((step, j) => <li key={j}>{step.operation}: “{step.text}” [{step.start}, {step.end}) {step.ruleId ? `· rule ${step.ruleId}` : `· word ${step.entryId}, sense ${step.sense ?? 'gloss'}`}</li>)}</ol>
          <details><summary>Reverse generation from this meaning · {generated.status}</summary>
            {generated.diagnostics.map((message, j) => <p key={j}>{message}</p>)}
            {generated.candidates.map((value, j) => <div key={j}><p>{value.text}</p><details><summary>Generation derivation</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify(value.steps, null, 2)}</pre></details></div>)}
          </details>
        </details>
      })}
    </div>}
  </section>
}
