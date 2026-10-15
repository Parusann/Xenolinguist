import type { LanguageProfile, Hypothesis } from 'shared/types'
import { hypothesisState } from 'engine/evidence/graph'
import { evidenceCounts } from 'engine/evidence/scores'

export function EvidenceInspector({ profile, targetId, hypothesis }: { profile: LanguageProfile; targetId?: string; hypothesis?: Hypothesis }) {
  const hypotheses = hypothesis ? [hypothesis] : profile.research.hypotheses.filter(h =>
    h.content.kind === 'lexical' ? h.content.entry_id === targetId : h.content.kind === 'grammar' && h.content.rule_id === targetId)
  return <section aria-label="Evidence inspector" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
    <h3 className="label">Recorded evidence</h3>
    {!hypotheses.length && <p className="dim">No linked research evidence. Record observations and hypotheses in Field Log.</p>}
    {hypotheses.map(h => {
      const status = hypothesisState(profile, h), counts = evidenceCounts(profile, h.id)
      return <div key={h.id}>
        <p><strong>{h.label}</strong> · {status.state}</p>
        <p>Support {counts.supports} · Contradiction {counts.contradicts} · Ambiguous {counts.ambiguous} · Stale links {counts.staleLinks}</p>
        <p className="dim">User belief: {h.manual_belief ?? 'unrated'} · Evidence counts, not probability.</p>
        {status.reasons.map(reason => <p key={reason} role="status">{reason}</p>)}
        <ul style={{ paddingLeft: 18 }}>{profile.research.links.filter(l => l.hypothesis_id === h.id).map(link => {
          const o = profile.research.observations.find(o => o.id === link.observation_id)!
          const a = profile.research.annotations.find(a => a.id === link.annotation_id)
          return <li key={link.id} style={{ marginBottom: 8 }}><strong>{link.relation}</strong>: “{link.span ? o.text.slice(link.span.start, link.span.end) : o.text}”
            <div>{o.source} · {o.origin} · {link.span ? `[${link.span.start}, ${link.span.end})` : 'whole capture'}</div>
            {o.audio && <div>Audio {o.audio.clip_id}: {o.audio.start}–{o.audio.end}s</div>}
            {a && <div>Interpretation revision {a.revision}: {a.interpretation}</div>}
            {link.note && <div>{link.note}</div>}
          </li>
        })}</ul>
      </div>
    })}
  </section>
}
