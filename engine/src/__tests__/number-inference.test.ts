import { describe, expect, it } from 'vitest';
import { inferNumbers } from '../numbers/score.js';
import { predictConsensus, nextNumberQuestion } from '../numbers/predict.js';
import { NUMBER_BASES, predictNumber, type NumberGrammar, type NumberExpression } from '../numbers/grammar.js';
import { enumerateNumbers } from '../numbers/enumerate.js';
import { numberSystemSchema } from '../../../shared/schemas/profile.js';

// Independent renderer: the learner sees only integer/form pairs, never this specification.
function language(base: number, kind: 'additive' | 'multiplicative', reversed = false, linker = ' ') {
  const atoms = Object.fromEntries(Array.from({ length: base + 1 }, (_, n) => [n, `v${String.fromCodePoint(0x3b1 + n)}`]));
  const surface = (n: number): string => {
    if (n <= base) return atoms[n];
    const q = Math.floor(n / base), r = n % base;
    let high = kind === 'additive' ? Array.from({ length: q }, () => atoms[base]).join(linker) : q === 1 ? atoms[base] :
      (reversed ? [atoms[base], surface(q)] : [surface(q), atoms[base]]).join(linker);
    if (r) high = (reversed ? [atoms[r], high] : [high, atoms[r]]).join(linker);
    return high;
  };
  const observe = (value: number) => ({ value, form: surface(value) });
  return { atoms, surface, observe, fit: Array.from({ length: 3 * base }, (_, n) => observe(n)), validation: [observe(3 * base), observe(3 * base + 1)] };
}
function arithmetic(tree: NumberExpression): number {
  if (tree.kind === 'atom') return tree.value;
  const value = tree.kind === 'add' ? arithmetic(tree.left) + arithmetic(tree.right) : arithmetic(tree.left) * arithmetic(tree.right);
  expect(value).toBe(tree.value); return value;
}
describe('bounded number grammar inference', () => {
  it.each([2, 3, 4, 5, 10, 20])('predicts independent withheld forms in additive and mixed base %i systems', base => {
    for (const kind of ['additive', 'multiplicative'] as const) for (const reversed of [false, true]) {
      const data = language(base, kind, reversed);
      const inference = inferNumbers({ fit: data.fit, validation: data.validation });
      expect(inference.candidates.length, inference.reason).toBeGreaterThan(0);
      for (const value of [3 * base + 2, 4 * base + 1, 5 * base - 1]) {
        const prediction = predictConsensus(inference, value);
        expect(prediction.status, JSON.stringify({ base, kind, reversed, inference: inference.reason, value })).toBe('predicted');
        expect(prediction.variants[0].form).toBe(data.surface(value));
        expect(arithmetic(prediction.variants[0].tree)).toBe(value);
      }
    }
  });
  it.each(['-', ' + ', 'மீ'])('infers an observed linking form %s without receiving operators', linker => {
    const data = language(5, 'multiplicative', false, linker);
    const result = inferNumbers({ fit: data.fit, validation: data.validation });
    expect(predictConsensus(result, 18).variants[0]?.form).toBe(data.surface(18));
  });
  it('keeps untested multiplication alternatives and asks for a discriminating answer', () => {
    const fit = [{ value: 1, form: 'ra' }, { value: 2, form: 'ru' }, { value: 3, form: 'ri' }, { value: 5, form: 'ka' }, { value: 6, form: 'ka ra' }, { value: 7, form: 'ka ru' }];
    const result = inferNumbers({ fit });
    expect(result.status).toBe('ambiguous'); expect(result.leaderIds.length).toBeGreaterThan(1);
    expect(predictConsensus(result, 8)).toMatchObject({ status: 'predicted', variants: [{ form: 'ka ri' }] });
    const question = nextNumberQuestion(result, fit.map(o => o.value));
    expect(question?.value).toBe(10); expect(question?.variants.length).toBeGreaterThan(1);
    const answered = inferNumbers({ fit, validation: [{ value: 10, form: 'ru ka' }] });
    expect(answered.leaderIds.length).toBeLessThan(result.leaderIds.length);
    expect(predictConsensus(answered, 13)).toMatchObject({ status: 'predicted', variants: [{ form: 'ru ka ri' }] });
  });
  it('abstains on one productive comparison and duplicate copies do not provide extra support', () => {
    const fit = [{ value: 1, form: 'ra' }, { value: 2, form: 'ru' }, { value: 5, form: 'ka' }, { value: 6, form: 'ka ra' }];
    expect(inferNumbers({ fit }).status).toBe('insufficient');
    const result = inferNumbers({ fit: [...fit, ...fit, ...fit] });
    expect(result).toMatchObject({ status: 'insufficient', duplicatesRemoved: 8 });
    expect(predictConsensus(result, 7).status).toBe('unknown');
  });
  it('does not turn irregular observations into productive atoms or conceal their contradictions', () => {
    const data = language(5, 'multiplicative');
    const fit = data.fit.map(o => o.value === 13 ? { ...o, form: 'suppletive' } : o);
    const result = inferNumbers({ fit, validation: data.validation });
    const leader = result.candidates.find(c => c.id === result.leaderIds[0])!;
    expect(leader.grammar.base).toBe(5);
    expect(leader.fit.find(o => o.value === 13)).toMatchObject({ outcome: 'contradiction', observed: 'suppletive' });
    expect(leader.grammar.atoms[13]).toBeUndefined();
    expect(predictConsensus(result, 13).variants[0].form).not.toBe('suppletive');
    expect(predictConsensus(result, 18).variants[0].form).toBe(data.surface(18));
  });
  it('retains competing bases and exposes contradictions hidden by token-overlap ties', () => {
    const fit = Object.entries({ 1: 'ra', 2: 'ru', 5: 'ka', 6: 'ka ra', 7: 'ka ru', 10: 'ten', 11: 'ten ra', 12: 'ten ru' }).map(([n, form]) => ({ value: Number(n), form }));
    const result = inferNumbers({ fit });
    expect(new Set(result.candidates.map(c => c.grammar.base))).toEqual(new Set([5, 10]));
    expect(new Set(result.candidates.filter(c => result.leaderIds.includes(c.id)).map(c => c.grammar.base))).toEqual(new Set([10]));
    expect(result.candidates.filter(c => c.grammar.base === 5).every(c => c.contradictions > 0)).toBe(true);
  });
  it('retains bases with identical observed forms and distinguishes their productive support from stored atoms', () => {
    const fit = Object.entries({ 1: 'ra', 2: 'ru', 5: 'ka', 6: 'ka ra', 7: 'ka ru', 10: 'ka ka', 11: 'ka ka ra', 12: 'ka ka ru' }).map(([n, form]) => ({ value: Number(n), form }));
    const result = inferNumbers({ fit });
    const consistent = result.candidates.filter(c => !c.contradictions && c.fit.every(o => ['atom', 'correct'].includes(o.outcome)));
    expect(new Set(consistent.map(c => c.grammar.base))).toEqual(new Set([5, 10]));
    expect(consistent.find(c => c.grammar.base === 5)!.support).toBe(5);
    expect(consistent.find(c => c.grammar.base === 10)!.support).toBe(2);
  });
  it('rejects collisions, conflicting values and fit/validation leakage', () => {
    expect(inferNumbers({ fit: [{ value: 1, form: 'Ra' }, { value: 2, form: 'ra' }] }).status).toBe('ambiguous');
    expect(inferNumbers({ fit: [{ value: 1, form: 'a' }, { value: 1, form: 'b' }] }).status).toBe('invalid');
    expect(inferNumbers({ fit: [{ value: 1, form: 'a' }], validation: [{ value: 1, form: 'a' }] }).status).toBe('invalid');
  });
  it('never uses validation to construct atoms or linkers and handles missing atoms explicitly', () => {
    const data = language(5, 'multiplicative');
    const fit = data.fit.filter(o => o.value !== 3);
    const result = inferNumbers({ fit, validation: [{ value: 3, form: data.atoms[3] }] });
    expect(result.candidates.filter(c => c.grammar.base === 5).every(c => !c.grammar.atoms[3])).toBe(true);
    expect(predictConsensus(result, 18).status).toBe('unknown');
    const grammars = enumerateNumbers({ fit: [{ value: 1, form: 'a' }, { value: 5, form: 'b' }], validation: [{ value: 6, form: 'b secret a' }], caseSensitive: true });
    expect(grammars.grammars.some(g => g.additionJoiner.includes('secret'))).toBe(false);
  });
  it('validates integer and grammar boundaries before any recursive composition', () => {
    const g: NumberGrammar = { base: 5, kind: 'multiplicative', additionOrder: 'high-first', multiplicationOrder: 'coefficient-first', additionJoiner: ' ', multiplicationJoiner: ' ', atoms: { 1: 'a', 2: 'b', 5: 'c' } };
    for (const base of [1, 0, -2, 2.5, 37, Infinity, NaN]) expect(predictNumber({ ...g, base }, 125).status).toBe('invalid');
    for (const n of [-1, 1.5, 4096, Infinity, NaN]) expect(predictNumber(g, n).status).toBe('invalid');
    expect(predictNumber({ ...g, atoms: { ...g.atoms, 125: 'hidden exception' } }, 125).status).toBe('invalid');
    expect(predictNumber({ ...g, kind: 'additive' }, 4095).status).toBe('limit');
    expect(predictNumber({ ...g, kind: 'additive', atoms: { 5: 'a'.repeat(128) } }, 25).status).toBe('limit');
    expect(predictNumber(g, 3).status).toBe('unknown');
    expect(NUMBER_BASES).toEqual(expect.arrayContaining([2, 3, 4, 36]));
  });
  it('keeps case policy and NFC explicit and refuses oversized input rather than truncating', () => {
    const fit = [{ value: 1, form: 'A' }, { value: 2, form: 'B' }, { value: 5, form: 'K' }, { value: 6, form: 'k a' }, { value: 7, form: 'k b' }];
    expect(inferNumbers({ fit }).candidates.length).toBeGreaterThan(0);
    expect(inferNumbers({ fit, caseSensitive: true }).status).toBe('insufficient');
    expect(inferNumbers({ fit: [{ value: 1, form: 'e\u0301' }, { value: 2, form: 'é' }] }).status).toBe('ambiguous');
    expect(inferNumbers({ fit: Array.from({ length: 65 }, (_, value) => ({ value, form: 'n' + value })) }).status).toBe('invalid');
    expect(inferNumbers({ fit: [], hiddenRules: [] }).status).toBe('invalid');
    const manyLinks = [{ value: 1, form: 'ra' }, { value: 5, form: 'ka' }, ...Array.from({ length: 9 }, (_, i) => ({ value: 6 + i, form: `ka link${i} ra` }))];
    expect(inferNumbers({ fit: manyLinks })).toMatchObject({ status: 'limit', candidates: [], leaderIds: [] });
    expect(numberSystemSchema.safeParse({ base: null, mappings: {}, operators: {}, validation_values: [4096] }).success).toBe(false);
    expect(numberSystemSchema.parse({ base: null, mappings: {}, operators: {} }).validation_values).toBeUndefined();
  });
});
