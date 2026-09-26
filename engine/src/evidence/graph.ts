import type { LanguageProfile, Research, Hypothesis } from '../../../shared/types.js';

export const numberEvidenceSnapshot = (p: LanguageProfile) => JSON.stringify({ mappings: p.number_system.mappings, validation: p.number_system.validation_values, caseSensitive: p.lexical_policy?.caseSensitive ?? false });
export const latestAnnotation = (r: Research, id: string) => r.annotations.filter(a => a.observation_id === id).at(-1);
export const withdrawn = (r: Research, id: string) => r.events.some(e => e.kind === 'withdraw-observation' && e.observation_id === id);
export function observationRoots(r: Research): Map<string, Set<string>> {
  const roots = new Map<string, Set<string>>();
  for (const o of r.observations) roots.set(o.id, o.derived_from.length
    ? new Set(o.derived_from.flatMap(id => [...(roots.get(id) ?? [])]))
    : new Set([o.text.normalize('NFC').toLowerCase().trim().replace(/\s+/gu, ' ')]));
  return roots;
}
export function observationUnavailable(r: Research, id: string): boolean {
  // Schema validation requires ancestors to precede their descendants, avoiding recursion/cycles.
  const unavailable = new Set<string>();
  for (const o of r.observations) if (withdrawn(r, o.id) || o.derived_from.some(parent => unavailable.has(parent) || (latestAnnotation(r, parent)?.id ?? null) !== (o.parent_annotations?.[parent] ?? null))) unavailable.add(o.id);
  return unavailable.has(id) || !r.observations.some(o => o.id === id);
}
export function hypothesisState(profile: LanguageProfile, h: Hypothesis) {
  const r = profile.research;
  const explicit = r.events.filter(e => e.kind === 'hypothesis-status' && e.hypothesis_id === h.id).at(-1);
  const state = explicit?.kind === 'hypothesis-status' ? explicit.status : 'proposed';
  if (['rejected', 'superseded', 'invalidated'].includes(state)) return { state, reasons: [explicit!.reason] };
  if (r.hypotheses.some(next => next.supersedes === h.id)) return { state: 'superseded', reasons: ['A replacement hypothesis was recorded'] };
  const reasons: string[] = [];
  const content = h.content;
  if (content.kind === 'lexical') {
    const word = profile.dictionary.find(w => w.id === content.entry_id);
    if (!word || word.alien_word !== content.form || word.english_meaning !== content.meaning) reasons.push('The referenced lexical assertion changed or was removed');
  } else if (content.kind === 'grammar') {
    const rule = profile.grammar_rules.find(rule => rule.id === content.rule_id);
    if (!rule || JSON.stringify(rule.executable) !== JSON.stringify(content.rule)) reasons.push('The referenced executable rule changed or was removed');
  }
  if (content.kind === 'number' && content.input_snapshot !== numberEvidenceSnapshot(profile)) reasons.push('The number mappings, validation selection or case policy changed');
  for (const link of r.links.filter(l => l.hypothesis_id === h.id)) {
    if (observationUnavailable(r, link.observation_id)) reasons.push(`Observation ${link.observation_id} was withdrawn or its source interpretation changed`);
    if ((latestAnnotation(r, link.observation_id)?.id ?? null) !== link.annotation_id) reasons.push(`Interpretation of ${link.observation_id} has a newer revision`);
  }
  return { state: reasons.length ? 'invalidated' : state, reasons: [...new Set(reasons)] };
}
