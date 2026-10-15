import type { Meaning, Entity, Clause } from '../../../engine/src/types.js';
import { atoms, meaningKey, predictionSchema, type Input, type Output, type Atom } from '../contracts.js';
import { template, type Hypothesis } from './prior.js';

/** Version-space elimination over 24 supplied structural hypotheses, with bijective lexical unification. */
export function induce(input: Pick<Input, 'observations'>): Hypothesis[] {
  const survivors: Hypothesis[] = [];
  for (const family of ['SVO', 'SOV', 'VSO'] as const) for (const before of [true, false]) for (const base of [4, 8, 10, 12]) {
    const h: Hypothesis = { family, before, base, lexicon: {} }, inverse = new Map<string, string>();
    let consistent = true;
    for (const o of input.observations) {
      const keys = template(o.scene, h), words = o.utterance.split(' ');
      if (keys.length !== words.length) { consistent = false; break; }
      for (let i = 0; i < keys.length; i++) {
        if ((h.lexicon[keys[i]] && h.lexicon[keys[i]] !== words[i]) || (inverse.has(words[i]) && inverse.get(words[i]) !== keys[i])) { consistent = false; break; }
        h.lexicon[keys[i]] = words[i]; inverse.set(words[i], keys[i]);
      }
      if (!consistent) break;
    }
    if (consistent) survivors.push(h);
  }
  return survivors;
}
export function decode(surface: string, h: Hypothesis): Meaning | undefined {
  const inverse = Object.fromEntries(Object.entries(h.lexicon).map(([k, v]) => [v, k]));
  const tokens = surface.split(' ').map(t => inverse[t]);
  if (tokens.some(t => t === undefined)) return;
  let at = 0;
  const eat = (token: string) => { if (tokens[at++] !== token) throw new Error('syntax'); };
  const number = (depth = 0): number => {
    if (depth > 8) throw new Error('depth');
    if (tokens[at] === 'add') {
      eat('add'); eat('multiply'); const high = number(depth + 1); eat('radix'); const low = number(depth + 1);
      if (high < 1 || low >= h.base) throw new Error('number');
      return high * h.base + low;
    }
    const token = tokens[at++];
    if (!/^(?:[0-9]|1[01])$/.test(token) || Number(token) >= h.base) throw new Error('digit');
    return Number(token);
  };
  const entity = (): Entity => {
    eat('open'); const count = number(), attributes: Entity['attributes'] = [];
    const readAttributes = () => { while (tokens[at] === 'red' || tokens[at] === 'small') attributes.push(tokens[at++] as 'red' | 'small'); };
    if (h.before) readAttributes();
    const noun = tokens[at++] as Entity['noun'];
    if (!h.before) readAttributes();
    if (count > 1) eat('plural'); eat('close'); return { noun, count, attributes };
  };
  try {
    const clauses: Clause[] = [];
    do {
      if (clauses.length) eat('and');
      let agent!: Entity, patient!: Entity, action!: Clause['action'], tense: Clause['tense'] = 'present', negated = false;
      for (const role of h.family) {
        if (role === 'S') agent = entity(); else if (role === 'O') patient = entity();
        else {
          if (tokens[at] === 'past' || tokens[at] === 'future') tense = tokens[at++] as Clause['tense'];
          if (tokens[at] === 'not') { at++; negated = true; }
          action = tokens[at++] as Clause['action'];
        }
      }
      clauses.push({ agent, action, patient, tense, negated });
    } while (tokens[at] === 'and' && clauses.length < 2);
    const result = predictionSchema.parse({ clauses });
    if (at !== tokens.length || template(result, h).map(k => h.lexicon[k]).join(' ') !== surface) return;
    return result;
  } catch { return; }
}
export function lexicalConsensus(input: Input, hypotheses: Hypothesis[]) {
  return input.lexicalProbes.map(token => {
    const meanings = hypotheses.map(h => Object.keys(h.lexicon).find(k => h.lexicon[k] === token));
    const value = meanings[0];
    return value && atoms.includes(value as Atom) && meanings.every(m => m === value)
      ? { token, status: 'answered' as const, value: value as Atom } : { token, status: 'abstained' as const };
  });
}
export async function symbolic(input: Input): Promise<Output> {
  const hypotheses = induce(input);
  return { predictions: input.challenges.map(c => {
    const values = hypotheses.map(h => decode(c.utterance, h));
    const first = values[0];
    return first && values.every(v => v && meaningKey(v) === meaningKey(first))
      ? { id: c.id, status: 'answered', meaning: first }
      : { id: c.id, status: 'abstained', detail: hypotheses.length ? 'Unresolved across surviving hypotheses' : 'No consistent hypothesis' };
  }), lexical: lexicalConsensus(input, hypotheses), diagnostics: { hypothesisCount: hypotheses.length, hypotheses, modelUsed: false } };
}
