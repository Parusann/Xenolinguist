import type { DictionaryEntry, ExecutableRule } from '../../../shared/types.js';
import type { NumberGrammar } from '../../../shared/schemas/numbers.js';
import type { MeaningTree } from '../../../engine/src/grammar/ast.js';
import type { GroundedQuery } from '../../../engine/src/elicitation/contracts.js';
import { queryKey } from '../../../engine/src/elicitation/contracts.js';
import { meaningTreeSchema } from '../../../engine/src/morphology/generate.js';

export const config = { version: 'elicitation-experiment-1', developmentSeeds: [8100, 8101, 8102, 8103, 8104, 8105], evaluationSeeds: [9200, 9201, 9202, 9203, 9204, 9205, 9206, 9207, 9208, 9209, 9210, 9211], ciSeeds: [11939],
  conditions: ['regular', 'costly', 'withheld-irregular', 'unavailable'], randomSeeds: [17, 43, 89, 131, 197], maxObservations: 8, maxCost: 12 } as const;
export type Condition = typeof config.conditions[number];
export type Split = 'development' | 'evaluation' | 'ci';
export type Visible = { domain: 'number'; candidates: { id: string; grammar: NumberGrammar }[]; available: GroundedQuery[] } |
  { domain: 'grammar'; candidates: { id: string; rules: ExecutableRule[] }[]; dictionary: DictionaryEntry[]; anchors: MeaningTree[]; available: GroundedQuery[] };
export type Case = { id: string; seed: number; condition: Condition; visible: Visible; oracle: { key: string; form: string }[]; targets: { query: GroundedQuery; expected: string }[] };
const numberQuery = (value: number, cost = 1): GroundedQuery => ({ kind: 'number', value, cost });
const meaningQuery = (meaning: MeaningTree, cost = 1): GroundedQuery => ({ kind: 'meaning', meaning: meaningTreeSchema.parse(meaning), cost });

export function corpusCase(seed: number, domain: Visible['domain'], condition: Condition): Case {
  let visible: Visible, targets: Case['targets'], oracle: Case['oracle'];
  const token = (i: number) => 's' + seed.toString(36) + 'x' + i.toString(36);
  if (domain === 'number') {
    const base = [5, 7, 11, 13][seed % 4], atoms = Object.fromEntries(Array.from({ length: base + 1 }, (_, i) => [i, token(i)]));
    const candidates: Extract<Visible, { domain: 'number' }>['candidates'] = [];
    for (const kind of ['multiplicative', 'additive'] as const) for (const additionOrder of ['high-first', 'low-first'] as const)
      for (const multiplicationOrder of (kind === 'additive' ? ['coefficient-first'] : ['coefficient-first', 'base-first']) as ('coefficient-first' | 'base-first')[])
        candidates.push({ id: 'n' + candidates.length, grammar: { base, kind, additionOrder, multiplicationOrder, additionJoiner: ' ', multiplicationJoiner: ' ', atoms: { ...atoms } } });
    const truth = candidates[seed % candidates.length].grammar;
    // Independent corpus renderer: no shipping number composer supplies answers.
    const render = (n: number): string => {
      if (n <= base) return atoms[n];
      const q = Math.floor(n / base), r = n % base;
      const high = truth.kind === 'additive' ? Array(q).fill(atoms[base]).join(' ') : q === 1 ? atoms[base] :
        (truth.multiplicationOrder === 'coefficient-first' ? [render(q), atoms[base]] : [atoms[base], render(q)]).join(' ');
      return !r ? high : (truth.additionOrder === 'high-first' ? [high, atoms[r]] : [atoms[r], high]).join(' ');
    };
    const values = [1, 2, base + 1, 2 * base, 2 * base + 1, 3 * base, 3 * base + 1, 4 * base];
    visible = { domain, candidates, available: values.map(n => numberQuery(n, condition === 'costly' && n > base && n % base === 1 && n >= 2 * base ? 4 : 1)) };
    oracle = values.map(n => ({ key: queryKey(numberQuery(n)), form: render(n) }));
    targets = [2 * base + 2, 3 * base + 2, 4 * base + 1, 4 * base + 2, 5 * base + 1, 5 * base + 2].map(n => ({ query: numberQuery(n), expected: render(n) }));
    if (condition === 'unavailable') candidates.push({ id: 'unknown', grammar: { ...candidates[0].grammar, atoms: { [base]: atoms[base] } } });
  } else {
    const word = (id: string, form: string, meaning: string, pos: DictionaryEntry['part_of_speech']): DictionaryEntry => ({ id, alien_word: form, english_meaning: meaning, part_of_speech: pos,
      confidence: null, context: '', examples: [], notes: '', created_at: '2026-10-01T00:00:00.000Z', ...(pos === 'verb' ? { verb_frame: 'transitive' } : {}) });
    const dictionary = [word('star', token(1), 'star', 'noun'), word('rock', token(2), 'rock', 'noun'), word('see', token(3), 'to see', 'verb')];
    const noun = (id: string) => ({ head: { entryId: id, sense: null, lemma: id, pos: 'noun' as const }, plural: false, adjectives: [] });
    const star: MeaningTree = { kind: 'nominal', nominal: noun('star') }, rock: MeaningTree = { kind: 'nominal', nominal: noun('rock') };
    const clause: Extract<MeaningTree, { kind: 'clause' }> = { kind: 'clause', subject: noun('star'), verb: { entryId: 'see', sense: null, lemma: 'see', pos: 'verb' }, object: noun('rock'), tense: 'present', negated: false };
    const candidates: Extract<Visible, { domain: 'grammar' }>['candidates'] = [];
    for (const position of ['prefix', 'suffix'] as const) for (const past of ['prefix', 'suffix'] as const) for (const order of ['SVO', 'SOV'] as const)
      candidates.push({ id: 'g' + candidates.length, rules: [{ kind: 'plural-affix', position, affix: token(4) }, { kind: 'tense-affix', tense: 'past', position: past, affix: token(5) },
        { kind: 'clause-order', order, arguments: 2 }, { kind: 'negation', position: 'before', marker: token(6) }, { kind: 'tense-affix', tense: 'future', position: 'prefix', affix: token(7) }] });
    const truthIndex = seed % 8, pluralPrefix = truthIndex < 4, pastPrefix = truthIndex % 4 < 2, svo = truthIndex % 2 === 0;
    // Independent realization from corpus factors, not engine generation or candidate predictions.
    const render = (m: MeaningTree): string => {
      const nominal = (n: typeof clause.subject) => { const stem = n.head.entryId === 'star' ? token(1) : token(2); return !n.plural ? stem : pluralPrefix ? token(4) + stem : stem + token(4); };
      if (m.kind === 'nominal') return nominal(m.nominal);
      const stem = token(3), verb = m.tense === 'past' ? pastPrefix ? token(5) + stem : stem + token(5) : m.tense === 'future' ? token(7) + stem : stem;
      const predicate = m.negated ? token(6) + ' ' + verb : verb;
      return (svo ? [nominal(m.subject), predicate, nominal(m.object!)] : [nominal(m.subject), nominal(m.object!), predicate]).join(' ');
    };
    const meanings: MeaningTree[] = [star, rock, { ...star, nominal: { ...star.nominal, plural: true } }, { ...rock, nominal: { ...rock.nominal, plural: true } }, clause,
      { ...clause, tense: 'past' }, { ...clause, subject: { ...clause.subject, plural: true } }, { ...clause, subject: clause.object!, object: clause.subject }, { ...clause, negated: true }, { ...clause, tense: 'future' }];
    visible = { domain, dictionary, candidates, anchors: [star, rock, clause], available: meanings.map((m, i) => meaningQuery(m, condition === 'costly' && [5, 6].includes(i) ? 4 : 1)) };
    oracle = meanings.map(m => ({ key: queryKey(meaningQuery(m)), form: render(m) }));
    targets = [
      { ...clause, tense: 'past' as const, subject: { ...clause.subject, plural: true } },
      { ...clause, tense: 'past' as const, object: { ...clause.object!, plural: true } },
      { ...clause, tense: 'past' as const, negated: true },
      { ...clause, subject: { ...clause.object!, plural: true }, object: clause.subject },
      { ...clause, tense: 'future' as const, subject: { ...clause.subject, plural: true } },
      { ...clause, negated: true, object: { ...clause.object!, plural: true } },
    ].map(m => ({ query: meaningQuery(m), expected: render(m) }));
    if (condition === 'unavailable') candidates.push({ id: 'unknown', rules: [] });
  }
  if (condition === 'withheld-irregular') targets = targets.map((t, i) => i < 2 ? { ...t, expected: 'irregular-' + token(100 + i) } : t);
  return { id: `${domain}-${seed}-${condition}`, seed, condition, visible, oracle, targets };
}
export function corpus(split: Split): Case[] {
  const seeds = split === 'development' ? config.developmentSeeds : split === 'evaluation' ? config.evaluationSeeds : config.ciSeeds;
  return seeds.flatMap(seed => (['number', 'grammar'] as const).flatMap(domain => config.conditions.map(condition => corpusCase(seed, domain, condition))));
}
