import type { LanguageProfile } from '../../../shared/types.js';
import { latestAnnotation, observationRoots, observationUnavailable } from './graph.js';

export function evidenceCounts(profile: LanguageProfile, hypothesisId: string) {
  const r = profile.research, roots = observationRoots(r);
  const counts = { supports: new Set<string>(), contradicts: new Set<string>(), ambiguous: new Set<string>() };
  let staleLinks = 0;
  for (const link of r.links.filter(l => l.hypothesis_id === hypothesisId)) {
    if (observationUnavailable(r, link.observation_id) || (latestAnnotation(r, link.observation_id)?.id ?? null) !== link.annotation_id) { staleLinks++; continue; }
    for (const root of roots.get(link.observation_id) ?? []) counts[link.relation].add(root);
  }
  return { definition: 'evidence-counts-1' as const, supports: counts.supports.size, contradicts: counts.contradicts.size,
    ambiguous: counts.ambiguous.size, staleLinks };
}
