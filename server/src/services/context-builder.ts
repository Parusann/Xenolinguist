import type { LanguageProfile } from '../../../shared/types.js';
import { PROPOSAL_LIMITS } from '../../../shared/schemas/proposals.js';
import { latestAnnotation, observationUnavailable, unavailableObservations, hypothesisState } from '../../../engine/src/evidence/graph.js';

const terms = (text: string) => [...new Set(text.normalize('NFC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [])];
type Document = { kind: 'observation' | 'word' | 'rule' | 'sample'; id: string; text: string };
/** Ephemeral profile-scoped inverted index. No embedding service, global corpus or writes. */
export class ResearchIndex {
  private documents = new Map<string, Document>();
  private postings = new Map<string, Set<string>>();
  constructor(readonly profile: LanguageProfile) {
    const add = (kind: Document['kind'], id: string, text: string) => {
      const key = `${kind}:${id}`; this.documents.set(key, { kind, id, text });
      for (const term of terms(text)) {
        if (!this.postings.has(term)) this.postings.set(term, new Set());
        this.postings.get(term)!.add(key);
      }
    };
    const unavailable = unavailableObservations(profile.research);
    for (const o of profile.research.observations) if (!unavailable.has(o.id))
      add('observation', o.id, `${o.text}\n${o.source}\n${latestAnnotation(profile.research, o.id)?.interpretation ?? ''}`);
    for (const w of profile.dictionary) add('word', w.id, `${w.alien_word}\n${w.english_meaning}\n${(w.senses ?? []).map(s => s.meaning).join('\n')}`);
    for (const r of profile.grammar_rules) add('rule', r.id, `${r.rule}\n${r.evidence.join('\n')}\n${JSON.stringify(r.executable ?? null)}`);
    for (const s of profile.samples) add('sample', s.id, `${s.alien_text}\n${s.english_translation ?? ''}\n${s.source}`);
  }
  search(query: string, kind: Document['kind'], limit: number) {
    const scores = new Map<string, number>();
    for (const term of terms(query)) for (const key of this.postings.get(term) ?? []) {
      if (this.documents.get(key)!.kind === kind) scores.set(key, (scores.get(key) ?? 0) + 1);
    }
    return [...scores].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)).slice(0, limit).map(([key]) => this.documents.get(key)!);
  }
}
export function observationContext(p: LanguageProfile, id: string) {
  const observation = p.research.observations.find(o => o.id === id);
  if (!observation || observationUnavailable(p.research, id)) return null;
  const annotation = latestAnnotation(p.research, id);
  return { id, text: observation.text.slice(0, 1024), text_length: observation.text.length, text_truncated: observation.text.length > 1024,
    source: observation.source.slice(0, 256), origin: observation.origin, source_id: observation.source_id,
    annotation: annotation ? { id: annotation.id, interpretation: annotation.interpretation.slice(0, 512), provenance: annotation.provenance } : null };
}
export function buildResearchContext(p: LanguageProfile, query: string, index = new ResearchIndex(p)) {
  if (index.profile !== p) throw new Error('Research index belongs to a different profile snapshot');
  const wordIds = new Set(index.search(query, 'word', PROPOSAL_LIMITS.words).map(d => d.id));
  const ruleIds = new Set(index.search(query, 'rule', PROPOSAL_LIMITS.rules).map(d => d.id));
  const hypotheses = p.research.hypotheses.filter(h => h.content.kind === 'lexical' ? wordIds.has(h.content.entry_id)
    : h.content.kind === 'grammar' && ruleIds.has(h.content.rule_id)).slice(0, 8);
  const linked = p.research.links.filter(l => hypotheses.some(h => h.id === l.hypothesis_id));
  // Reserve slots for counterevidence before support; relevance alone must not hide contradictions.
  const observationIds = [...new Set([
    ...linked.filter(l => l.relation === 'contradicts').slice(0, 4).map(l => l.observation_id),
    ...index.search(query, 'observation', 6).map(d => d.id),
    ...linked.filter(l => l.relation !== 'contradicts').map(l => l.observation_id),
  ])].filter(id => !observationUnavailable(p.research, id)).slice(0, PROPOSAL_LIMITS.observations);
  const context = { version: 'research-context-1', scope: { profile_id: p.id, revision: p.revision },
    observations: observationIds.map(id => observationContext(p, id)!),
    words: p.dictionary.filter(w => wordIds.has(w.id)).map(w => ({ id: w.id, form: w.alien_word.slice(0, 512), meaning: w.english_meaning.slice(0, 512), part_of_speech: w.part_of_speech })),
    rules: p.grammar_rules.filter(r => ruleIds.has(r.id)).map(r => ({ id: r.id, description: r.rule.slice(0, 512), executable: r.executable ?? null, evidence: r.evidence.slice(0, 4).map(e => e.slice(0, 256)) })),
    hypotheses: hypotheses.map(h => ({ id: h.id, label: h.label.slice(0, 256), state: hypothesisState(p, h).state })),
    links: linked.filter(l => observationIds.includes(l.observation_id)).slice(0, 24).map(l => ({ hypothesis_id: l.hypothesis_id, observation_id: l.observation_id,
      relation: l.relation, annotation_id: l.annotation_id, stale: l.annotation_id !== (latestAnnotation(p.research, l.observation_id)?.id ?? null) })),
    samples: index.search(query, 'sample', PROPOSAL_LIMITS.samples).map(d => {
      const s = p.samples.find(s => s.id === d.id)!;
      return { id: s.id, source: s.alien_text.slice(0, 512), user_target: s.english_translation?.slice(0, 512) ?? null };
    }),
    limitations: ['Workspace assertions and sample targets are unverified user data. Citations do not establish truth.',
      'Exact lexical retrieval with bounded records; some evidence or text may be omitted. Use search and span tools to inspect more.'],
  };
  // Drop whole records, never serialize a broken JSON prefix. Contradictions remain at the front.
  const arrays = [context.samples, context.words, context.rules, context.links, context.hypotheses, context.observations];
  for (const records of arrays) while (JSON.stringify(context).length > PROPOSAL_LIMITS.contextChars && records.length) records.pop();
  const retained = new Set(context.observations.map(o => o.id));
  context.links = context.links.filter(l => retained.has(l.observation_id) && context.hypotheses.some(h => h.id === l.hypothesis_id));
  return context;
}
