import type { LanguageProfile } from '../../../shared/types.js';
import type { NumberInput } from '../../../shared/schemas/numbers.js';
import type { ElicitationReport } from '../../../shared/schemas/elicitation-records.js';
import { inferNumbers } from '../numbers/score.js';
import { selectNumberQuery } from './select.js';

/** Only evidence used by number inference belongs in this snapshot. */
export function numberSessionInput(profile: LanguageProfile): NumberInput {
  const observations = Object.entries(profile.number_system.mappings).filter(([, form]) => form.trim()).map(([value, form]) => ({ value: Number(value), form })).sort((a, b) => a.value - b.value);
  const validation = new Set(profile.number_system.validation_values ?? []);
  return { fit: observations.filter(o => !validation.has(o.value)), validation: observations.filter(o => validation.has(o.value)), caseSensitive: profile.lexical_policy?.caseSensitive ?? false };
}
/** The interactive grounding interface can ask a human for integers 1–64 at equal declared cost. */
export function numberSessionReport(input: NumberInput, declined: number[]): ElicitationReport {
  const inference = inferNumbers(input), plan = selectNumberQuery({
    candidates: inference.candidates.filter(c => inference.leaderIds.includes(c.id)).map(({ id, grammar }) => ({ id, grammar })),
    caseSensitive: input.caseSensitive, questions: { available: Array.from({ length: 64 }, (_, i) => ({ kind: 'number', value: i + 1, cost: 1 })),
      observed: [...input.fit, ...input.validation].map(o => o.value), declined },
  });
  const selected = plan.selected;
  return { version: 'number-elicitation-session-1', status: plan.status, reason: plan.reason,
    inferenceStatus: inference.status, inferenceReason: inference.reason, leaderIds: inference.leaderIds, candidates: inference.candidates.length,
    fitCount: inference.fitCount, validationCount: inference.validationCount, considered: plan.ranked.length,
    eligible: plan.ranked.filter(q => q.eligible).length, unavailable: plan.ranked.filter(q => q.unavailable).length,
    selection: selected && selected.query.kind === 'number' ? { value: selected.query.value, cost: selected.query.cost,
      disagreementBits: selected.disagreementBits!, expectedRemaining: selected.expectedRemaining!, groups: selected.groups } : null };
}
