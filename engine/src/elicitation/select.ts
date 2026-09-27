import { normalizeNumberForm } from '../numbers/grammar.js';
import { ELICITATION_VERSION, compareKeys, queryKey, stableKey, type ElicitationPlan, type OutcomeGroup, type RankedQuery } from './contracts.js';
import { uniformDisagreement } from './information-gain.js';
import { predictNumberOutcomes, predictGrammarOutcomes, type OutcomeMatrix } from './predict-outcomes.js';

function rank(matrix: OutcomeMatrix): ElicitationPlan {
  const ranked: RankedQuery[] = matrix.rows.map(row => {
    const groups = new Map<string, OutcomeGroup>();
    for (const prediction of row.predictions) {
      if (prediction.status !== 'predicted') continue;
      const form = normalizeNumberForm(prediction.form, matrix.caseSensitive);
      const group = groups.get(form) ?? { form, candidateIds: [] };
      group.candidateIds.push(prediction.candidateId); groups.set(form, group);
    }
    const unavailable = row.predictions.filter(p => p.status === 'unavailable').length;
    const eligible = !unavailable && groups.size > 1;
    const score = !unavailable && groups.size ? uniformDisagreement([...groups.values()].map(g => g.candidateIds.length)) : null;
    return { ...row, key: queryKey(row.query), groups: [...groups.values()].sort((a, b) => compareKeys(a.form, b.form)), unavailable, eligible,
      disagreementBits: score?.disagreementBits ?? null, expectedRemaining: score?.expectedRemaining ?? null,
      utility: score ? score.disagreementBits / row.query.cost : null, redundantWith: null };
  });
  ranked.sort((a, b) => Number(b.eligible) - Number(a.eligible) || (b.utility ?? -1) - (a.utility ?? -1) || a.query.cost - b.query.cost || compareKeys(a.key, b.key));
  const partitions = new Map<string, string>();
  for (const query of ranked.filter(q => q.eligible)) {
    // Same partition has the same information under uniform weights, regardless of surface labels.
    const partition = stableKey(query.groups.map(g => [...g.candidateIds].sort()).sort((a, b) => compareKeys(stableKey(a), stableKey(b))));
    query.redundantWith = partitions.get(partition) ?? null;
    if (!query.redundantWith) partitions.set(partition, query.key);
  }
  const selected = ranked.find(q => q.eligible && !q.redundantWith) ?? null;
  return { version: ELICITATION_VERSION, status: selected ? 'selected' : 'none', weighting: 'uniform-distinct-candidates',
    reason: selected ? 'Maximum uniform version-space disagreement per declared cost; not calibrated information gain.' :
      'No fully predicted disagreement in the supplied available query set. This does not establish equivalent hypotheses.',
    candidates: matrix.candidates, ranked, selected };
}
function plan(predict: () => OutcomeMatrix): ElicitationPlan {
  try { return rank(predict()); }
  catch (error) { return { version: ELICITATION_VERSION, status: 'invalid', reason: error instanceof Error ? error.message : String(error),
    weighting: 'uniform-distinct-candidates', candidates: [], ranked: [], selected: null }; }
}
export const selectNumberQuery = (raw: unknown) => plan(() => predictNumberOutcomes(raw));
export const selectGrammarQuery = (raw: unknown) => plan(() => predictGrammarOutcomes(raw));
