import { z } from 'zod';
import { numeralValueSchema, numberGrammarSchema } from '../../../shared/schemas/numbers.js';
import { dictionaryEntrySchema } from '../../../shared/schemas/profile.js';
import { executableRuleSchema } from '../../../shared/schemas/grammar.js';
import { lexicalPolicySchema } from '../../../shared/schemas/lexicon.js';
import { meaningTreeSchema } from '../morphology/generate.js';

export const ELICITATION_VERSION = 'version-space-elicitation-1';
export const ELICITATION_LIMITS = { candidates: 256, queries: 512, grammarCandidates: 32, meanings: 64, anchors: 16, rules: 64, dictionary: 128 } as const;
const cost = z.number().finite().min(1).max(1000).default(1);
export const numberQuerySchema = z.strictObject({ kind: z.literal('number'), value: numeralValueSchema, cost });
export const meaningQuerySchema = z.strictObject({ kind: z.literal('meaning'), meaning: meaningTreeSchema, cost });
export const querySchema = z.discriminatedUnion('kind', [numberQuerySchema, meaningQuerySchema]);
export type GroundedQuery = z.infer<typeof querySchema>;
export const contrastSchema = z.enum(['plurality', 'tense', 'negation', 'roles']);
export const numberQueriesSchema = z.strictObject({
  available: z.array(numberQuerySchema).max(ELICITATION_LIMITS.queries),
  observed: z.array(numeralValueSchema).max(4096).default([]),
  declined: z.array(numeralValueSchema).max(4096).default([]),
});
export const meaningQueriesSchema = z.strictObject({
  anchors: z.array(meaningTreeSchema).max(ELICITATION_LIMITS.anchors),
  available: z.array(meaningQuerySchema).max(ELICITATION_LIMITS.meanings),
  observed: z.array(meaningTreeSchema).max(ELICITATION_LIMITS.meanings).default([]),
  declined: z.array(meaningTreeSchema).max(ELICITATION_LIMITS.meanings).default([]),
  contrasts: z.array(contrastSchema).max(4).default(['plurality', 'tense', 'negation', 'roles']),
});
const candidateId = z.string().min(1).max(128);
export const numberElicitationSchema = z.strictObject({
  candidates: z.array(z.strictObject({ id: candidateId, grammar: numberGrammarSchema })).max(ELICITATION_LIMITS.candidates),
  questions: numberQueriesSchema,
  caseSensitive: z.boolean().default(false),
});
export const grammarElicitationSchema = z.strictObject({
  candidates: z.array(z.strictObject({ id: candidateId, rules: z.array(executableRuleSchema).max(ELICITATION_LIMITS.rules) })).max(ELICITATION_LIMITS.grammarCandidates),
  dictionary: z.array(dictionaryEntrySchema).max(ELICITATION_LIMITS.dictionary),
  lexical_policy: lexicalPolicySchema.optional(),
  questions: meaningQueriesSchema,
});
export type CandidateIdentity = { id: string; aliases: string[] };
export type Prediction = { candidateId: string; status: 'predicted'; form: string } |
  { candidateId: string; status: 'unavailable'; reason: string };
export type QueryOutcomes = { query: GroundedQuery; predictions: Prediction[] };
export type OutcomeGroup = { form: string; candidateIds: string[] };
export type RankedQuery = QueryOutcomes & {
  key: string; groups: OutcomeGroup[]; unavailable: number; eligible: boolean;
  disagreementBits: number | null; expectedRemaining: number | null; utility: number | null;
  redundantWith: string | null;
};
export type ElicitationPlan = {
  version: typeof ELICITATION_VERSION; status: 'selected' | 'none' | 'invalid'; reason: string;
  weighting: 'uniform-distinct-candidates'; candidates: CandidateIdentity[];
  ranked: RankedQuery[]; selected: RankedQuery | null;
};

/** Stable semantic keys: object insertion order is irrelevant, role/array order is not. */
export function stableKey(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableKey).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k => (value as Record<string, unknown>)[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + stableKey((value as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export const compareKeys = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function queryKey(query: GroundedQuery) {
  return query.kind === 'number' ? 'number:' + String(query.value).padStart(4, '0') : 'meaning:' + stableKey(query.meaning);
}
