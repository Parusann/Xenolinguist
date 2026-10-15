import { queryKey, stableKey, type GroundedQuery } from '../../../engine/src/elicitation/contracts.js';
import { selectGrammarQuery, selectNumberQuery } from '../../../engine/src/elicitation/select.js';
import { predictGrammarOutcomes, predictNumberOutcomes } from '../../../engine/src/elicitation/predict-outcomes.js';
import { normalizeNumberForm } from '../../../engine/src/numbers/grammar.js';
import { config, type Case, type Visible } from './corpus.js';

export const methods = ['active', 'random', 'curriculum'] as const;
export type Method = typeof methods[number];
export type Answer = { query: GroundedQuery; form: string };
export function matrix(visible: Visible, queries: GroundedQuery[]) {
  return visible.domain === 'number' ? predictNumberOutcomes({ candidates: visible.candidates, questions: { available: queries } }) :
    predictGrammarOutcomes({ candidates: visible.candidates, dictionary: visible.dictionary, questions: { anchors: queries.map(q => {
      if (q.kind !== 'meaning') throw Error('Meaning required'); return q.meaning;
    }), available: queries } });
}
export function survivors(visible: Visible, history: Answer[]) {
  const predictions = history.map(a => matrix(visible, [a.query]));
  const ids = matrix(visible, []).candidates.map(c => c.id).filter(id => predictions.every((m, i) => {
    const p = m.rows[0].predictions.find(p => p.candidateId === id)!;
    return p.status === 'unavailable' || p.form === normalizeNumberForm(history[i].form, false);
  }));
  return visible.domain === 'number' ? { ...visible, candidates: visible.candidates.filter(c => ids.includes(c.id)) } : { ...visible, candidates: visible.candidates.filter(c => ids.includes(c.id)) };
}
const random = (seed: number) => { let x = (seed + 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

/** This boundary receives no corpus identity, oracle table, hidden rule or test target. */
export function choose(visible: Visible, history: Answer[], method: Method, randomSeed: number, remainingCost: number) {
  const used = new Set(history.map(a => queryKey(a.query))), current = survivors(visible, history);
  const available = visible.available.filter(q => !used.has(queryKey(q)) && q.cost <= remainingCost);
  const input = current.domain === 'number' ? { candidates: current.candidates, questions: { available } } :
    { candidates: current.candidates, dictionary: current.dictionary, questions: { anchors: current.anchors, available } };
  const plan = current.domain === 'number' ? selectNumberQuery(input) : selectGrammarQuery(input);
  if (plan.status === 'invalid') throw Error(plan.reason);
  const allowed = new Set(plan.ranked.map(q => queryKey(q.query)));
  // All policies use the same answerable set. Baselines may ask uninformative/unavailable-prediction questions.
  const pool = available.filter(q => allowed.has(queryKey(q)));
  const selected = method === 'active' ? plan.selected?.query ?? null : pool.length ? pool[method === 'curriculum' ? 0 : Math.floor(random(randomSeed + history.length * 104729) * pool.length)] : null;
  return { input, plan, selected };
}
export function predictTargets(visible: Visible, targets: Case['targets']) {
  return targets.map(t => {
    const row = matrix(visible, [t.query]).rows[0], forms = row.predictions.flatMap(p => p.status === 'predicted' ? [p.form] : []);
    const predicted = forms.length > 0 && forms.length === row.predictions.length && new Set(forms).size === 1 ? forms[0] : null;
    return { query: t.query, expected: t.expected, predicted, status: predicted === null ? 'abstained' : predicted === normalizeNumberForm(t.expected, false) ? 'correct' : 'wrong' };
  });
}
export function schedule(cases: Case[]) {
  return cases.flatMap(c => methods.flatMap(method => (method === 'random' ? [...config.randomSeeds] : [0]).map(randomSeed => ({ c, method, randomSeed }))));
}
type Step = { observations: number; cost: number; remaining: string[]; targets: ReturnType<typeof predictTargets>; answer: Answer | null; choice: ReturnType<typeof choose> | null };
export type Record = { id: string; caseId: string; domain: Visible['domain']; condition: Case['condition']; method: Method; randomSeed: number;
  visible: Visible; targetCount: number; history: Answer[]; steps: Step[]; stop: string; failed: string | null };
export function measure(c: Case, method: Method, randomSeed: number, selector = choose): Record {
  const history: Answer[] = [], record: Record = { id: c.id + ':' + method + ':' + randomSeed, caseId: c.id, domain: c.visible.domain, condition: c.condition,
    method, randomSeed, visible: structuredClone(c.visible), targetCount: c.targets.length, history, steps: [], stop: '', failed: null };
  let cost = 0;
  const step = (answer: Answer | null, choice: ReturnType<typeof choose> | null) => {
    const current = survivors(c.visible, history);
    record.steps.push({ observations: history.length, cost, remaining: matrix(current, []).candidates.map(c => c.id), targets: predictTargets(current, c.targets), answer, choice });
  };
  try {
    step(null, null);
    for (;;) {
      const remaining = record.steps.at(-1)!.remaining;
      if (remaining.length <= 1) { record.stop = remaining.length ? 'single-alternative' : 'all-contradicted'; break; }
      if (history.length >= config.maxObservations) { record.stop = 'observation-budget'; break; }
      const choice = selector(structuredClone(c.visible), structuredClone(history), method, randomSeed, config.maxCost - cost);
      if (!choice.selected) { record.stop = 'no-policy-query'; break; }
      const q = choice.selected, offered = c.visible.available.find(v => queryKey(v) === queryKey(q));
      if (!offered || stableKey(offered) !== stableKey(q) || history.some(a => queryKey(a.query) === queryKey(q)) || cost + q.cost > config.maxCost) throw Error('Invalid or unaffordable selected query');
      // The oracle returns only the selected answer. Target scoring below never feeds back into selection.
      const oracleAnswer = c.oracle.find(a => a.key === queryKey(q));
      if (!oracleAnswer) throw Error('Selected query has no oracle answer');
      const answer = { query: q, form: oracleAnswer.form }; history.push(answer); cost += q.cost; step(answer, choice);
    }
  } catch (e) { record.failed = (e as Error).message; record.stop = 'failed'; }
  return record;
}
export function replay(c: Case, record: Record) {
  if (stableKey(measure(c, record.method, record.randomSeed)) !== stableKey(record)) throw Error('Learning trace replay mismatch');
}
export function point(record: Record, axis: 'observations' | 'cost', budget: number) {
  const step = record.steps.filter(s => s[axis] <= budget).at(-1);
  const counts = { correct: 0, wrong: 0, abstained: 0 };
  for (const t of step?.targets ?? Array.from({ length: record.targetCount }, () => ({ status: 'abstained' }))) counts[t.status as keyof typeof counts]++;
  return { ...counts, total: counts.correct + counts.wrong + counts.abstained, queries: step?.observations ?? 0, cost: step?.cost ?? 0, remaining: step?.remaining.length ?? 0 };
}
export function summarize(records: Record[]) {
  const curves = [], paired = [];
  for (const domain of ['number', 'grammar'] as const) for (const condition of config.conditions) for (const axis of ['observations', 'cost'] as const) {
    const rows = records.filter(r => r.domain === domain && r.condition === condition), max = axis === 'observations' ? config.maxObservations : config.maxCost;
    for (let budget = 0; budget <= max; budget++) {
      for (const method of methods) {
        const group = rows.filter(r => r.method === method), p = group.map(r => point(r, axis, budget));
        const sum = (k: keyof ReturnType<typeof point>) => p.reduce((n, v) => n + v[k], 0);
        curves.push({ domain, condition, axis, budget, method, traces: group.length, failures: group.filter(r => r.failed).length, correct: sum('correct'), wrong: sum('wrong'), abstained: sum('abstained'), total: sum('total'),
          meanQueries: group.length ? sum('queries') / group.length : null, meanCost: group.length ? sum('cost') / group.length : null, meanRemaining: group.length ? sum('remaining') / group.length : null });
      }
      for (const baseline of ['random', 'curriculum'] as const) {
        const deltas = [...new Set(rows.map(r => r.caseId))].map(id => {
          const active = point(rows.find(r => r.caseId === id && r.method === 'active')!, axis, budget);
          const comparisons = rows.filter(r => r.caseId === id && r.method === baseline).map(r => point(r, axis, budget));
          return { caseId: id, delta: active.correct / active.total - comparisons.reduce((n, p) => n + p.correct / p.total, 0) / comparisons.length };
        });
        paired.push({ domain, condition, axis, budget, baseline, cases: deltas.length, meanDeltaCorrectRate: deltas.length ? deltas.reduce((n, d) => n + d.delta, 0) / deltas.length : null,
          wins: deltas.filter(d => d.delta > 1e-12).length, ties: deltas.filter(d => Math.abs(d.delta) <= 1e-12).length, losses: deltas.filter(d => d.delta < -1e-12).length, deltas });
      }
    }
  }
  return { version: config.version, traces: records.length, failures: records.filter(r => r.failed).length, curves, paired };
}
