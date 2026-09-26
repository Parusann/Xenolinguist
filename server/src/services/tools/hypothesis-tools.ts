import type { LanguageProfile } from '../../../../shared/types.js';
import type { ProposalAction } from '../../../../shared/schemas/proposals.js';
import { ResearchIndex, observationContext } from '../context-builder.js';
import { validateProposal } from '../proposal-validator.js';
import { observationUnavailable, latestAnnotation } from '../../../../engine/src/evidence/graph.js';

/** All capabilities operate on a private snapshot. None expose filesystem or execution primitives. */
export function executeHypothesisTool(profile: LanguageProfile, index: ResearchIndex, action: ProposalAction, sampleIds: string[]) {
  if (index.profile !== profile) throw new Error('Tool index belongs to a different profile snapshot');
  if (action.tool === 'search-observations') return { observations: index.search(action.query, 'observation', 6)
    .map(d => observationContext(profile, d.id)), limitation: 'Exact token matches; omitted or truncated evidence may exist.' };
  if (action.tool === 'inspect-span') {
    const o = profile.research.observations.find(o => o.id === action.observation_id);
    if (!o || observationUnavailable(profile.research, o.id)) return { error: 'Observation is unavailable in this profile' };
    if (action.start >= action.end || action.end > o.text.length || action.end - action.start > 512) return { error: 'Select a valid UTF-16 span of at most 512 code units' };
    return { observation_id: o.id, annotation_id: latestAnnotation(profile.research, o.id)?.id ?? null,
      start: action.start, end: action.end, quote: o.text.slice(action.start, action.end) };
  }
  return validateProposal(profile, action.proposal, sampleIds);
}
