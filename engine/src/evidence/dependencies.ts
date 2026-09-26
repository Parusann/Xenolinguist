import type { LanguageProfile, ResearchDependency, ResearchAnalysis } from '../../../shared/types.js';
import { latestAnnotation, hypothesisState, observationUnavailable } from './graph.js';

/** Sorted exact snapshots, not probabilistic hashes. Array order is significant. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v);
}
function observationValue(p: LanguageProfile, id: string) {
  const o = p.research.observations.find(o => o.id === id);
  return { capture: o ?? null, annotation: latestAnnotation(p.research, id) ?? null, unavailable: observationUnavailable(p.research, id) };
}
export function dependencyValue(p: LanguageProfile, kind: ResearchDependency['kind'], id: string): unknown {
  if (kind === 'evidence') return { observations: p.research.observations, annotations: p.research.annotations, hypotheses: p.research.hypotheses, links: p.research.links, events: p.research.events };
  if (kind === 'lexicon') return p.dictionary;
  if (kind === 'grammar') return p.grammar_rules;
  if (kind === 'policy') return p.lexical_policy ?? null;
  if (kind === 'observation') return observationValue(p, id);
  const h = p.research.hypotheses.find(h => h.id === id);
  return h ? { hypothesis: h, state: hypothesisState(p, h), links: p.research.links.filter(l => l.hypothesis_id === id)
    .map(link => ({ link, observation: observationValue(p, link.observation_id) })) } : null;
}
export function dependency(p: LanguageProfile, kind: ResearchDependency['kind'], id = ''): ResearchDependency {
  return { kind, id, snapshot: canonical(dependencyValue(p, kind, id)) };
}
export function staleReasons(p: LanguageProfile, record: Pick<ResearchAnalysis, 'profile_revision' | 'dependencies'>): string[] {
  const reasons = record.dependencies.filter(d => d.snapshot !== canonical(dependencyValue(p, d.kind, d.id)))
    .map(d => `${d.kind}${d.id ? ` ${d.id}` : ''} changed`);
  if (record.profile_revision > p.revision) reasons.push('Result refers to a future profile revision');
  return reasons;
}
export function translationDependencies(p: LanguageProfile): ResearchDependency[] {
  // Whole inventories include negative evidence: a newly added competing word or rule can change a parse.
  return (['lexicon', 'grammar', 'policy', 'evidence'] as const).map(kind => dependency(p, kind));
}
