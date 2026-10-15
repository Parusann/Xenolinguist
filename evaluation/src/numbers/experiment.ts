import { inferNumbers } from '../../../engine/src/numbers/score.js';
import { predictConsensus } from '../../../engine/src/numbers/predict.js';
import { type NumberInput } from '../../../engine/src/numbers/grammar.js';
export const conditions = ['regular', 'sparse', 'withheld-irregular', 'duplicate-form'] as const;
export type NumberCondition = typeof conditions[number];
export type NumberSpec = { seed: number; base: number; kind: 'additive' | 'multiplicative'; reversed: boolean; linker: string };

/** Independent renderer. No engine composition function supplies corpus truth. */
export function numberCorpus(spec: NumberSpec) {
  let state = spec.seed >>> 0;
  const atoms = Object.fromEntries(Array.from({ length: spec.base + 1 }, (_, value) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return [value, 'n' + spec.seed.toString(36) + 'x' + state.toString(36)];
  }));
  const render = (value: number): string => {
    if (value <= spec.base) return atoms[value];
    const count = Math.floor(value / spec.base), remainder = value % spec.base;
    let high = spec.kind === 'additive' ? Array.from({ length: count }, () => atoms[spec.base]).join(spec.linker) :
      count === 1 ? atoms[spec.base] : (spec.reversed ? [atoms[spec.base], render(count)] : [render(count), atoms[spec.base]]).join(spec.linker);
    if (remainder) high = (spec.reversed ? [atoms[remainder], high] : [high, atoms[remainder]]).join(spec.linker);
    return high;
  };
  const observe = (value: number) => ({ value, form: render(value) });
  const validationValues = [3 * spec.base, 3 * spec.base + 1];
  const fitValues = [...new Set([...Array.from({ length: spec.base + 1 }, (_, n) => n), spec.base + 1, spec.base + 2, 2 * spec.base, 2 * spec.base + 1, 2 * spec.base + 2, 3 * spec.base - 1])].filter(n => !validationValues.includes(n));
  return { input: { fit: fitValues.map(observe), validation: validationValues.map(observe), caseSensitive: false } satisfies NumberInput,
    withheld: [4 * spec.base + 1, 5 * spec.base + 1, 6 * spec.base + 1].map(observe) };
}
export function numberExperiment(spec: NumberSpec, condition: NumberCondition) {
  const corpus = numberCorpus(spec), input = structuredClone(corpus.input), withheld = structuredClone(corpus.withheld);
  if (condition === 'sparse') input.fit = input.fit.filter(o => o.value <= spec.base || o.value === spec.base + 1);
  if (condition === 'withheld-irregular') withheld[0].form = 'suppletive-' + spec.seed.toString(36);
  if (condition === 'duplicate-form') input.fit.find(o => o.value === 2)!.form = input.fit.find(o => o.value === 1)!.form;
  const inference = inferNumbers(input);
  const rows = withheld.map(target => {
    const prediction = predictConsensus(inference, target.value);
    const answered = prediction.status === 'predicted';
    const memorized = [...input.fit, ...input.validation].find(o => o.value === target.value)?.form ?? null;
    return { value: target.value, expected: target.form, prediction, answered,
      correct: answered && prediction.variants[0].form === target.form, memorized, memorizationCorrect: memorized === target.form };
  });
  return { spec, condition, input, inference, rows };
}
export type NumberExperiment = ReturnType<typeof numberExperiment>;
export function numberSpecs(seed: number, bases: number[]): NumberSpec[] {
  const result: NumberSpec[] = [];
  for (const base of bases) for (const kind of ['additive', 'multiplicative'] as const) for (const reversed of [false, true]) for (const linker of [' ', '-', ' ti '])
    result.push({ seed: seed * 1000 + result.length, base, kind, reversed, linker });
  return result;
}
export function numberSummary(records: NumberExperiment[]) {
  return conditions.map(condition => {
    const selected = records.filter(r => r.condition === condition), rows = selected.flatMap(r => r.rows);
    return { condition, languages: selected.length, total: rows.length, answered: rows.filter(r => r.answered).length,
      correct: rows.filter(r => r.correct).length, wrong: rows.filter(r => r.answered && !r.correct).length,
      abstained: rows.filter(r => !r.answered).length, memorizationCorrect: rows.filter(r => r.memorizationCorrect).length };
  });
}
