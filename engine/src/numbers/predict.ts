import { NUMBER_LIMITS, composeNumber, normalizeNumberForm, type NumberExpression } from './grammar.js';
import type { NumberCandidate, NumberInference } from './score.js';

export type NumberConsensus = { status: 'predicted' | 'ambiguous' | 'unknown'; variants: { form: string; candidateIds: string[]; tree: NumberExpression }[]; unavailable: number; failures: { candidateId: string; status: string; reason: string }[] };
export function predictConsensus(inference: NumberInference, value: number): NumberConsensus {
  const leaders = inference.candidates.filter(c => inference.leaderIds.includes(c.id));
  const variants = new Map<string, { form: string; candidateIds: string[]; tree: NumberExpression }>();
  let unavailable = 0;
  const failures: NumberConsensus['failures'] = [];
  for (const candidate of leaders) {
    const prediction = composeNumber(candidate.grammar, value);
    if (prediction.status !== 'predicted') { unavailable++; failures.push({ candidateId: candidate.id, status: prediction.status, reason: prediction.reason }); continue; }
    const key = normalizeNumberForm(prediction.form, inference.caseSensitive), old = variants.get(key);
    if (old) old.candidateIds.push(candidate.id);
    else variants.set(key, { form: prediction.form, tree: prediction.tree, candidateIds: [candidate.id] });
  }
  return { status: variants.size === 1 && !unavailable ? 'predicted' : variants.size > 1 ? 'ambiguous' : 'unknown', variants: [...variants.values()], unavailable, failures };
}
/** A bounded question for future elicitation; no guessed answer is stored as evidence. */
export function nextNumberQuestion(inference: NumberInference, observedValues: number[]) {
  if (inference.leaderIds.length < 2) return null;
  const observed = new Set(observedValues);
  for (let value = 1; value <= NUMBER_LIMITS.questions; value++) {
    if (observed.has(value)) continue;
    const prediction = predictConsensus(inference, value);
    if (prediction.variants.length > 1 && !prediction.unavailable) return { value, ...prediction };
  }
  return null;
}
export function describeNumberCandidate(candidate: NumberCandidate) {
  const g = candidate.grammar;
  return `Base ${g.base} · ${g.kind === 'additive' ? 'repeated addition' : 'multiplication + remainder'} · ${g.additionOrder} addition`;
}
export function describeNumberTree(tree: NumberExpression): string {
  return tree.kind === 'atom' ? `${tree.value} = “${tree.form}”` : `(${describeNumberTree(tree.left)} ${tree.kind === 'add' ? '+' : '×'} ${describeNumberTree(tree.right)}) = ${tree.value}`;
}
