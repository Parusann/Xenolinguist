import { z } from 'zod';
import type { Meaning } from '../../../engine/src/types.js';
export const NOUNS = ['bird', 'robot', 'fox', 'child'] as const;
export const ACTIONS = ['see', 'follow', 'help'] as const;
export const ATTRIBUTES = ['red', 'small'] as const;
const entity = z.strictObject({ noun: z.enum(NOUNS), count: z.number().int().min(1).max(99),
  attributes: z.array(z.enum(ATTRIBUTES)).max(2).refine(a => new Set(a).size === a.length) });
export const meaningSchema = z.strictObject({ clauses: z.array(z.strictObject({ agent: entity, action: z.enum(ACTIONS), patient: entity,
  tense: z.enum(['present', 'past', 'future']), negated: z.boolean() })).min(1).max(2) });
export function normalizeMeaning(input: unknown): Meaning {
  const result = meaningSchema.parse(input);
  for (const clause of result.clauses) for (const e of [clause.agent, clause.patient]) e.attributes.sort();
  return result;
}
export function semanticKey(input: unknown) { return JSON.stringify(normalizeMeaning(input)); }
/** Controlled English, deliberately explicit about tense, count and grammatical roles. */
export function canonicalEnglish(input: Meaning) {
  const plural = { bird: 'birds', robot: 'robots', fox: 'foxes', child: 'children' };
  const np = (e: Meaning['clauses'][number]['agent']) => `${e.count} ${e.attributes.length ? e.attributes.join(' ') + ' ' : ''}${e.count === 1 ? e.noun : plural[e.noun]}`;
  return normalizeMeaning(input).clauses.map(c => `${np(c.agent)} ${c.tense === 'past' ? 'did' : c.tense === 'future' ? 'will' : c.agent.count === 1 ? 'does' : 'do'}${c.negated ? ' not' : ''} ${c.action} ${np(c.patient)}`).join(' and ');
}
