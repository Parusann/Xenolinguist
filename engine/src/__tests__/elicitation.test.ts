import { describe, expect, it } from 'vitest';
import type { DictionaryEntry, ExecutableRule } from '../../../shared/types.js';
import type { NumberGrammar } from '../../../shared/schemas/numbers.js';
import type { MeaningTree } from '../grammar/ast.js';
import { inferNumbers } from '../numbers/score.js';
import { selectNumberQuery, selectGrammarQuery } from '../elicitation/select.js';
import { numberQueries, meaningQueries } from '../elicitation/queries.js';
import { uniformDisagreement } from '../elicitation/information-gain.js';
import { stableKey } from '../elicitation/contracts.js';

const grammar: NumberGrammar = { base: 5, kind: 'multiplicative', additionOrder: 'high-first', multiplicationOrder: 'coefficient-first',
  additionJoiner: ' ', multiplicationJoiner: ' ', atoms: { 0: 'z', 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'k' } };
const candidates = [
  { id: 'a', grammar },
  { id: 'b', grammar: { ...grammar, multiplicationOrder: 'base-first' as const } },
  { id: 'c', grammar: { ...grammar, kind: 'additive' as const } },
  { id: 'd', grammar: { ...grammar, kind: 'additive' as const, additionOrder: 'low-first' as const } },
];
const available = (...values: number[]) => values.map(value => ({ kind: 'number' as const, value, cost: 1 }));
const noun = (entryId: string, lemma: string) => ({ head: { entryId, sense: null, lemma, pos: 'noun' as const }, plural: false, adjectives: [] });
const star: MeaningTree = { kind: 'nominal', nominal: noun('star', 'star') };
const clause: MeaningTree = { kind: 'clause', subject: noun('star', 'star'), object: noun('rock', 'rock'),
  verb: { entryId: 'see', sense: null, lemma: 'see', pos: 'verb' }, tense: 'present', negated: false };
const word = (id: string, alien_word: string, english_meaning: string, part_of_speech: DictionaryEntry['part_of_speech']): DictionaryEntry => ({
  id, alien_word, english_meaning, part_of_speech, confidence: null, context: '', examples: [], notes: '', created_at: '2026-09-27T00:00:00.000Z',
  ...(part_of_speech === 'verb' ? { verb_frame: 'transitive' } : {}),
});
const dictionary = [word('star', 'nesh', 'star', 'noun'), word('rock', 'kor', 'rock', 'noun'), word('see', 'lor', 'to see', 'verb')];
const meaningAvailable = (...meanings: MeaningTree[]) => meanings.map(meaning => ({ kind: 'meaning' as const, meaning, cost: 1 }));
const svo: ExecutableRule = { kind: 'clause-order', order: 'SVO', arguments: 2 };
const plural: MeaningTree = { ...star, nominal: { ...star.nominal, plural: true } };

describe('bounded active elicitation', () => {
  it('computes uniform partition disagreement and expected remaining candidates with explicit invalid counts', () => {
    expect(uniformDisagreement([2, 2])).toEqual({ disagreementBits: 1, expectedRemaining: 2 });
    expect(uniformDisagreement([4])).toEqual({ disagreementBits: 0, expectedRemaining: 4 });
    expect(uniformDisagreement([1, 1, 1, 1])).toEqual({ disagreementBits: 2, expectedRemaining: 1 });
    expect(uniformDisagreement([3, 1]).disagreementBits).toBeCloseTo(0.811278124459);
    expect(uniformDisagreement([3, 1, 2])).toEqual(uniformDisagreement([2, 3, 1]));
    for (const sizes of [[], [0], [-1], [1.5], [Infinity], [Number.MAX_SAFE_INTEGER, 1]]) expect(() => uniformDisagreement(sizes)).toThrow();
  });

  it('prefers a four-way split over the first discriminating numeral, without looking up an answer', () => {
    const plan = selectNumberQuery({ candidates, questions: { available: available(6, 10, 11) } });
    expect(plan).toMatchObject({ status: 'selected', weighting: 'uniform-distinct-candidates', selected: { query: { value: 11 }, disagreementBits: 2, expectedRemaining: 1 } });
    expect(plan.selected?.groups.map(g => g.form)).toEqual(['a k k', 'b k a', 'k b a', 'k k a']);
    expect(plan.ranked.find(q => q.query.kind === 'number' && q.query.value === 6)?.disagreementBits).toBeCloseTo(0.811278124459);
  });

  it('charges declared query cost and marks equivalent partitions as redundant with a deterministic cheaper representative', () => {
    const plan = selectNumberQuery({ candidates, questions: { available: [available(6)[0], { ...available(11)[0], cost: 3 }] } });
    expect(plan.selected?.query).toMatchObject({ value: 6 });
    const equal = selectNumberQuery({ candidates, questions: { available: [available(15)[0], { ...available(10)[0], cost: 2 }] } });
    expect(equal.selected?.query).toMatchObject({ value: 15 });
    expect(equal.ranked.find(q => q.key === 'number:0010')?.redundantWith).toBe('number:0015');
    const tied = selectNumberQuery({ candidates, questions: { available: available(15, 10) } });
    expect(tied.selected?.query).toMatchObject({ value: 10 });
  });

  it('excludes observed and declined values without turning a declined query into evidence', () => {
    const input = { candidates, questions: { available: available(6, 10, 11, 11), observed: [6], declined: [11] } };
    const before = JSON.stringify(input), plan = selectNumberQuery(input);
    expect(plan.ranked).toHaveLength(1); expect(plan.selected?.query).toMatchObject({ value: 10 });
    expect(JSON.stringify(input)).toBe(before);
    expect(numberQueries({ available: available(3), observed: [3] })).toEqual([]);
  });

  it('does not inflate disagreement by cloning hypotheses or reordering inputs', () => {
    const original = selectNumberQuery({ candidates, questions: { available: available(6, 10, 11) } });
    const copy = selectNumberQuery({ candidates: [...candidates, { id: 'clone', grammar }].reverse(), questions: { available: available(11, 10, 6) } });
    expect(copy.selected).toEqual(original.selected);
    expect(copy.candidates).toHaveLength(4); expect(copy.candidates[0]).toEqual({ id: 'a', aliases: ['clone'] });
    expect(selectNumberQuery({ candidates: [{ id: 'x', grammar }, { id: 'x', grammar }], questions: { available: [] } }).status).toBe('invalid');
  });

  it('never rewards missing atoms or composition limits as distinguishing outcomes', () => {
    const missing = { ...grammar, atoms: { 1: 'a', 5: 'k' } };
    const plan = selectNumberQuery({ candidates: [candidates[0], { id: 'missing', grammar: missing }], questions: { available: available(10) } });
    expect(plan).toMatchObject({ status: 'none', selected: null, ranked: [{ unavailable: 1, disagreementBits: null, utility: null }] });
    expect(plan.ranked[0].predictions[1]).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('unknown') });
    const limited = selectNumberQuery({ candidates: [candidates[0], candidates[2]], questions: { available: available(4095) } });
    expect(limited.status).toBe('none'); expect(limited.ranked[0].predictions.some(p => p.status === 'unavailable' && p.reason.includes('limit'))).toBe(true);
  });

  it('returns explicit bounded absence for consensus, a single candidate, and an empty query or candidate set', () => {
    for (const input of [
      { candidates, questions: { available: available(1) } },
      { candidates: [candidates[0]], questions: { available: available(11) } },
      { candidates, questions: { available: [] } },
      { candidates: [], questions: { available: available(11) } },
    ]) expect(selectNumberQuery(input)).toMatchObject({ status: 'none', selected: null });
  });

  it('normalizes Unicode and whitespace while respecting explicit case policy', () => {
    const a = { ...grammar, atoms: { 5: 'É' } }, b = { ...grammar, atoms: { 5: 'e\u0301' } };
    const input = { candidates: [{ id: 'a', grammar: a }, { id: 'b', grammar: b }], questions: { available: available(5) } };
    expect(selectNumberQuery(input).status).toBe('none');
    expect(selectNumberQuery({ ...input, caseSensitive: true }).selected?.groups).toHaveLength(2);
  });

  it('rejects oversize, hidden or malformed inputs before a partial ranking can be returned', () => {
    const good = { candidates, questions: { available: available(11) } };
    for (const bad of [
      { ...good, hiddenRules: { answer: 'secret' } },
      { ...good, candidates: Array.from({ length: 257 }, (_, i) => ({ ...candidates[0], id: String(i) })) },
      { ...good, questions: { available: Array(513).fill(available(11)[0]) } },
      ...[0, -1, NaN, Infinity, 1001].map(cost => ({ ...good, questions: { available: [{ ...available(11)[0], cost }] } })),
      { ...good, questions: { available: available(4096) } },
      { ...good, questions: { available: [available(11)[0], { ...available(11)[0], cost: 2 }] } },
    ]) expect(selectNumberQuery(bad)).toMatchObject({ status: 'invalid', selected: null, ranked: [] });
  });

  it('constructs only available one-change grounded contrasts and excludes observed or declined meanings', () => {
    const past = { ...clause, tense: 'past' as const }, negated = { ...clause, negated: true };
    const both = { ...past, negated: true }, swapped = { ...clause, subject: clause.object!, object: clause.subject };
    const queries = meaningQueries({ anchors: [clause], available: meaningAvailable(clause, past, negated, both, swapped), observed: [clause], declined: [negated] });
    expect(queries.map(q => q.kind === 'meaning' && stableKey(q.meaning)).sort()).toEqual([past, swapped].map(stableKey).sort());
    expect(meaningQueries({ anchors: [star], available: meaningAvailable(plural), contrasts: [] })).toEqual([]);
    expect(meaningQueries({ anchors: [star], available: meaningAvailable(plural) })).toHaveLength(1);
  });

  it('compares actual generated plural forms under competing executable rules', () => {
    const plan = selectGrammarQuery({ dictionary, candidates: [
      { id: 'suffix', rules: [{ kind: 'plural-affix', position: 'suffix', affix: '-en' }] },
      { id: 'prefix', rules: [{ kind: 'plural-affix', position: 'prefix', affix: 'en-' }] },
    ], questions: { anchors: [star], available: meaningAvailable(star, plural), observed: [star] } });
    expect(plan).toMatchObject({ status: 'selected', selected: { disagreementBits: 1, expectedRemaining: 1 } });
    expect(plan.selected?.groups.map(g => g.form)).toEqual(['en-nesh', 'nesh-en']);
  });

  it('compares tense and agent/patient contrasts without changing their meanings or admitting hidden targets', () => {
    const past = { ...clause, tense: 'past' as const };
    const plan = selectGrammarQuery({ dictionary, candidates: [
      { id: 'prefix', rules: [svo, { kind: 'tense-affix', tense: 'past', position: 'prefix', affix: 'pa-' }] },
      { id: 'suffix', rules: [svo, { kind: 'tense-affix', tense: 'past', position: 'suffix', affix: '-pa' }] },
    ], questions: { anchors: [clause], available: meaningAvailable(past) } });
    expect(plan.selected?.groups.map(g => g.form)).toEqual(['nesh lor-pa kor', 'nesh pa-lor kor']);
    const swapped = { ...clause, subject: clause.object!, object: clause.subject };
    const order = selectGrammarQuery({ dictionary, candidates: [{ id: 'svo', rules: [svo] }, { id: 'sov', rules: [{ ...svo, order: 'SOV' }] }],
      questions: { anchors: [clause], available: meaningAvailable(swapped) } });
    expect(order.selected?.groups.map(g => g.form)).toEqual(['kor lor nesh', 'kor nesh lor']);
  });

  it('rejects unsupported lexical grounding and ambiguous generation instead of scoring their absence', () => {
    const input = { dictionary, candidates: [
      { id: 'ambiguous', rules: [{ kind: 'plural-affix', position: 'suffix', affix: '-en' }, { kind: 'plural-affix', position: 'suffix', affix: '-s' }] },
      { id: 'suffix', rules: [{ kind: 'plural-affix', position: 'suffix', affix: '-en' }] },
    ], questions: { anchors: [star], available: meaningAvailable(plural) } };
    expect(selectGrammarQuery(input)).toMatchObject({ status: 'none', ranked: [{ unavailable: 1 }] });
    const stale = { ...plural, nominal: { ...plural.nominal, head: { ...plural.nominal.head, lemma: 'moon' } } };
    const result = selectGrammarQuery({ ...input, questions: { anchors: [stale], available: meaningAvailable(stale) } });
    expect(result).toMatchObject({ status: 'none', ranked: [{ unavailable: 2, disagreementBits: null }] });
  });

  it('deduplicates equivalent rule sets regardless of order or repeated rules, and enforces grammar bounds', () => {
    const p: ExecutableRule = { kind: 'plural-affix', position: 'suffix', affix: '-en' };
    const input = { dictionary, candidates: [{ id: 'a', rules: [p, svo] }, { id: 'b', rules: [svo, p, p] }], questions: { anchors: [star], available: meaningAvailable(plural) } };
    expect(selectGrammarQuery(input)).toMatchObject({ status: 'none', candidates: [{ id: 'a', aliases: ['b'] }] });
    expect(selectGrammarQuery({ ...input, candidates: Array.from({ length: 33 }, (_, i) => ({ id: String(i), rules: [] })) }).status).toBe('invalid');
    expect(selectGrammarQuery({ ...input, dictionary: [...dictionary, dictionary[0]] }).status).toBe('invalid');
    expect(selectGrammarQuery({ ...input, oracle: 'hidden specification' }).status).toBe('invalid');
  });

  it('selects from real inferred leaders and an independently supplied answer reduces the remaining alternatives', () => {
    const fit = [{ value: 1, form: 'ra' }, { value: 2, form: 'ru' }, { value: 3, form: 'ri' }, { value: 5, form: 'ka' }, { value: 6, form: 'ka ra' }, { value: 7, form: 'ka ru' }];
    const before = inferNumbers({ fit });
    const plan = selectNumberQuery({ candidates: before.candidates.filter(c => before.leaderIds.includes(c.id)).map(({ id, grammar }) => ({ id, grammar })),
      questions: { available: available(8, 10, 11, 12, 13), observed: fit.map(o => o.value) } });
    expect(plan.status).toBe('selected');
    const selected = plan.selected!.query;
    if (selected.kind !== 'number') throw Error('Expected number');
    // Independent fixture language: base-five coefficient-first multiplication with space joins.
    const atoms: Record<number, string> = { 1: 'ra', 2: 'ru', 3: 'ri', 5: 'ka' };
    const q = Math.floor(selected.value / 5), r = selected.value % 5;
    const form = [atoms[q], 'ka', ...(r ? [atoms[r]] : [])].join(' ');
    const after = inferNumbers({ fit, validation: [{ value: selected.value, form }] });
    expect(after.leaderIds.length).toBeLessThan(before.leaderIds.length);
    expect(plan.selected!.groups.some(g => g.form === form)).toBe(true);
  });
});
