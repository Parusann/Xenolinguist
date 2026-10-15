import { useState } from 'react'
import type { Hypothesis, LanguageProfile, Research } from 'shared/types'
import { latestAnnotation, hypothesisState } from 'engine/evidence/graph'
import { evidenceCounts } from 'engine/evidence/scores'
import { dependency } from 'engine/evidence/dependencies'
import { EvidenceInspector } from './EvidenceInspector'

import { recordIdentity } from './identity'
export function HypothesisComparison({ profile, hypothesis: h, edit, saved }: {
  profile: LanguageProfile; hypothesis: Hypothesis; edit: (fn: (r: Research) => Research) => void; saved: boolean
}) {
  const [observation, setObservation] = useState(''), [relation, setRelation] = useState<'supports' | 'contradicts' | 'ambiguous'>('supports')
  const [reason, setReason] = useState(''), [spanStart, setSpanStart] = useState(''), [spanEnd, setSpanEnd] = useState('')
  const state = hypothesisState(profile, h).state
  const o = profile.research.observations.find(o => o.id === observation)
  const span = spanStart === '' && spanEnd === '' ? null : { start: Number(spanStart), end: Number(spanEnd) }
  const validSpan = !span || (spanStart !== '' && spanEnd !== '' && Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.start < span.end && span.end <= (o?.text.length ?? 0))
  const changeStatus = (status: 'accepted' | 'rejected' | 'invalidated') => edit(r => ({ ...r, events: [...r.events,
    { ...recordIdentity(), kind: 'hypothesis-status', hypothesis_id: h.id, status, reason }] }))
  return <details open aria-label={`Hypothesis ${h.label}`} className="glass-inner" style={{ padding: 12, marginTop: 10 }}>
    <summary>{h.label} · {state}</summary>
    <EvidenceInspector profile={profile} hypothesis={h} />
    <label>Evidence observation<select aria-label={`Evidence observation for ${h.label}`} value={observation} onChange={e => setObservation(e.target.value)}>
      <option value="">Choose capture</option>{profile.research.observations.map(o => <option key={o.id} value={o.id}>{o.text.slice(0, 80)}</option>)}
    </select></label>
    <label>Relationship<select aria-label="Relationship" value={relation} onChange={e => setRelation(e.target.value as typeof relation)}>
      <option value="supports">Supports</option><option value="contradicts">Contradicts</option><option value="ambiguous">Ambiguous</option>
    </select></label>
    <div><label>Span start<input type="number" min="0" value={spanStart} onChange={e => setSpanStart(e.target.value)} /></label>
      <label>Span end<input type="number" min="1" value={spanEnd} onChange={e => setSpanEnd(e.target.value)} /></label></div>
    <p className="dim">Leave both blank for the whole capture. Offsets use original UTF-16 text.</p>
    <button className="btn sm" disabled={!o || !validSpan} onClick={() => edit(r => ({ ...r, links: [...r.links,
      { ...recordIdentity(), hypothesis_id: h.id, observation_id: observation, annotation_id: latestAnnotation(r, observation)?.id ?? null,
        relation, span, note: '' }] }))}>Link evidence</button>
    <label>Decision reason<input value={reason} maxLength={8192} onChange={e => setReason(e.target.value)} /></label>
    <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
      {(['accepted', 'rejected', 'invalidated'] as const).map(status => <button key={status} className="btn sm" disabled={!reason.trim() || !['proposed', 'accepted'].includes(state)} onClick={() => changeStatus(status)}>{status === 'accepted' ? 'Accept hypothesis' : status === 'rejected' ? 'Reject hypothesis' : 'Invalidate hypothesis'}</button>)}
      <button className="btn sm" onClick={() => edit(r => ({ ...r, hypotheses: [...r.hypotheses,
        { ...h, ...recordIdentity(), supersedes: h.id, label: `${h.label} (revision)` }] }))}>Propose replacement</button>
      <button className="btn sm" disabled={!saved} onClick={() => {
        const counts = evidenceCounts(profile, h.id)
        edit(r => ({ ...r, metrics: [...r.metrics, { ...recordIdentity(), definition: counts.definition, profile_revision: profile.revision,
          hypothesis_id: h.id, supports: counts.supports, contradicts: counts.contradicts, ambiguous: counts.ambiguous,
          dependencies: [dependency(profile, 'hypothesis', h.id)] }] }))
      }}>Save evidence counts</button>
    </div>
    <p className="dim">Acceptance records your decision. It does not certify accuracy or change executable rules. A replacement starts proposed with no evidence links.</p>
  </details>
}
