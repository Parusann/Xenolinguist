import { proposalActionSchema, PROPOSAL_LIMITS } from '../../../../shared/schemas/proposals.js';
import type { LanguageProfile } from '../../../../shared/types.js';
import { ResearchIndex } from '../context-builder.js';
import { RuntimeError } from '../runtime-error.js';
import { executeHypothesisTool } from './hypothesis-tools.js';

export function createHypothesisTools(profile: LanguageProfile, sampleIds: string[], signal: AbortSignal) {
  const snapshot = structuredClone(profile), selected = [...sampleIds], index = new ResearchIndex(snapshot);
  let iterations = 0;
  return { execute(input: unknown) {
    signal.throwIfAborted();
    const action = proposalActionSchema.parse(input);
    if (action.tool === 'finish') throw new RuntimeError('PROPOSAL_TOOL_INVALID', 'Finish is a response, not a tool', 422);
    if (iterations >= PROPOSAL_LIMITS.tools) throw new RuntimeError('PROPOSAL_TOOL_LIMIT', 'Research task reached its tool budget', 422);
    iterations++;
    const result = executeHypothesisTool(snapshot, index, action, selected);
    signal.throwIfAborted();
    return result;
  }, get iterations() { return iterations; } };
}
