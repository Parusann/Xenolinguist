import type { Entity, LanguageSpec, Meaning, Clause } from '../../../engine/src/types.js';
import { normalizeMeaning, NOUNS, ACTIONS, ATTRIBUTES } from './semantics.js';
import { validateLanguage } from './lexicon.js';

/** Prefix arithmetic: add(multiply(high, radix), low). Unique parse, including zero. */
export function numberTokens(value: number, s: LanguageSpec): string[] {
  if (!Number.isInteger(value) || value < 0 || value > 999) throw new Error('Number outside domain');
  const l = s.lexicon;
  return value < s.numberBase ? [l[String(value)]] : [l.add, l.multiply, ...numberTokens(Math.floor(value / s.numberBase), s), l.radix, l[String(value % s.numberBase)]];
}
export function utterance(input: Meaning, s: LanguageSpec): string {
  validateLanguage(s);
  const m = normalizeMeaning(input), l = s.lexicon;
  const np = (e: Entity) => {
    if (e.count > 1 && !s.features.plural) throw new Error('Plurality disabled');
    const attrs = e.attributes.map(a => l[a]);
    return [l.open, ...numberTokens(e.count, s), ...(s.adjectivePlacement === 'before' ? [...attrs, l[e.noun]] : [l[e.noun], ...attrs]),
      ...(e.count > 1 ? [l.plural] : []), l.close];
  };
  return m.clauses.map(c => {
    if ((c.tense !== 'present' && !s.features.tense) || (c.negated && !s.features.negation)) throw new Error('Meaning uses disabled features');
    const parts = { S: np(c.agent), O: np(c.patient), V: [...(c.tense === 'present' ? [] : [l[c.tense]]), ...(c.negated ? [l.not] : []), l[c.action]] };
    return [...s.family].flatMap(k => parts[k as keyof typeof parts]).join(' ');
  }).join(` ${l.and} `);
}
export function parseUtterance(surface: string, s: LanguageSpec): Meaning {
  validateLanguage(s);
  if (s.ambiguity !== 'none') throw new Error('Ambiguous language requires set-valued scoring; not available in v1');
  if (surface.length > 10000) throw new Error('Utterance exceeds limit');
  const tokens = surface.split(' '), l = s.lexicon; let at = 0;
  const eat = (token: string) => { if (tokens[at++] !== token) throw new Error('Invalid surface syntax'); };
  const number = (depth = 0): number => {
    if (depth > 10) throw new Error('Number depth exceeded');
    if (tokens[at] === l.add) {
      eat(l.add); eat(l.multiply); const high = number(depth + 1); eat(l.radix); const low = number(depth + 1);
      if (high < 1 || low >= s.numberBase || high * s.numberBase + low > 999) throw new Error('Noncanonical number');
      return high * s.numberBase + low;
    }
    const digit = Array.from({ length: s.numberBase }, (_, i) => i).find(i => tokens[at] === l[String(i)]);
    if (digit === undefined) throw new Error('Expected number'); at++; return digit;
  };
  const np = (): Entity => {
    eat(l.open); const count = number();
    const attrs = () => { const result: Entity['attributes'] = []; while (ATTRIBUTES.some(a => l[a] === tokens[at])) { result.push(ATTRIBUTES.find(a => l[a] === tokens[at])!); at++; } return result; };
    const attributes = s.adjectivePlacement === 'before' ? attrs() : [];
    const noun = NOUNS.find(n => l[n] === tokens[at]); at++; if (!noun) throw new Error('Expected noun');
    if (s.adjectivePlacement === 'after') attributes.push(...attrs());
    if (count > 1) eat(l.plural); eat(l.close); return { noun, count, attributes };
  };
  const clauses: Clause[] = [];
  do {
    if (clauses.length) eat(l.and);
    let agent!: Entity, patient!: Entity, action!: Clause['action']; let tense: Clause['tense'] = 'present', negated = false;
    for (const role of s.family) {
      if (role === 'S') agent = np(); else if (role === 'O') patient = np();
      else {
        if (tokens[at] === l.past || tokens[at] === l.future) tense = tokens[at++] === l.past ? 'past' : 'future';
        if (tokens[at] === l.not) { at++; negated = true; }
        const verb = ACTIONS.find(a => l[a] === tokens[at]); at++; if (!verb) throw new Error('Expected action'); action = verb;
      }
    }
    clauses.push({ agent, action, patient, tense, negated });
  } while (tokens[at] === l.and && clauses.length < 2);
  if (at !== tokens.length) throw new Error('Trailing tokens');
  const result = normalizeMeaning({ clauses });
  if (utterance(result, s) !== surface) throw new Error('Noncanonical surface');
  return result;
}
