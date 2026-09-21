import type { Meaning, Entity, Family } from '../../../engine/src/types.js';

/** Explicit hypothesis class supplied to ALL methods; no seed, lexicon or scorer imports. */
export const PRIOR = `The language is deterministic, space-delimited and has a one-to-one token lexicon.
Nouns: bird, robot, fox, child. Actions: see, follow, help. Attributes: red, small.
Unknown parameters: clause order SVO/SOV/VSO, adjectives before/after noun, integer base 4/8/10/12.
Entity = OPEN NUMBER (attributes noun OR noun attributes) PLURAL-if-count>1 CLOSE.
Attributes are in alphabetical English order. Verb = optional PAST/FUTURE, optional NOT, action.
Present tense has no marker. Clauses are joined by AND. Counts range 1..99; one or two clauses.
NUMBER(n) = digit(n) when n<base, otherwise ADD MULTIPLY NUMBER(floor(n/base)) RADIX digit(n%base).
OPEN/CLOSE/PLURAL/PAST/FUTURE/NOT/AND/ADD/MULTIPLY/RADIX and digits are unknown tokens.
Infer parameters and token meanings ONLY from the supplied observations. Abstain if unresolved.
No probabilities are requested; do not treat a rule-support count as confidence.`;
export interface Hypothesis { family: Family; before: boolean; base: number; lexicon: Record<string, string> }

/** Encode semantic labels, not alien tokens, to align a hypothesis against an observation. */
export function template(meaning: Meaning, h: Omit<Hypothesis, 'lexicon'>): string[] {
  const number = (n: number): string[] => n < h.base ? [String(n)] : ['add', 'multiply', ...number(Math.floor(n / h.base)), 'radix', String(n % h.base)];
  const entity = (e: Entity) => ['open', ...number(e.count), ...(h.before ? [...[...e.attributes].sort(), e.noun] : [e.noun, ...[...e.attributes].sort()]), ...(e.count > 1 ? ['plural'] : []), 'close'];
  return meaning.clauses.flatMap((c, i) => {
    const parts = { S: entity(c.agent), O: entity(c.patient), V: [...(c.tense === 'present' ? [] : [c.tense]), ...(c.negated ? ['not'] : []), c.action] };
    return [...(i ? ['and'] : []), ...[...h.family].flatMap(role => parts[role as keyof typeof parts])];
  });
}
