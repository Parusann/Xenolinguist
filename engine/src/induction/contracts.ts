import { z } from 'zod';
import type { DictionaryEntry, ExecutableRule, GrammarRule, LexicalPolicy } from '../../../shared/types.js';
import { dictionaryEntrySchema } from '../../../shared/schemas/profile.js';
import { lexicalPolicySchema } from '../../../shared/schemas/lexicon.js';
import { meaningTreeSchema } from '../morphology/generate.js';
import type { MeaningTree, Lexeme, Nominal } from '../grammar/ast.js';

export const INDUCTION_VERSION = 'grounded-induction-1';
export const SEARCH = Object.freeze({ observations: 48, dictionary: 128, candidates: 32, beam: 12, depth: 6, evaluations: 600, alternatives: 5 });
export const observationSchema = z.strictObject({ id: z.string().min(1).max(128), surface: z.string().trim().min(1).max(256), meaning: meaningTreeSchema });
export const inductionInputSchema = z.strictObject({ dictionary: z.array(dictionaryEntrySchema).min(1).max(SEARCH.dictionary),
  lexical_policy: lexicalPolicySchema.optional(), fit: z.array(observationSchema).min(1).max(SEARCH.observations),
  validation: z.array(observationSchema).min(1).max(SEARCH.observations) });
export interface Observation { id:string; surface:string; meaning:MeaningTree }
export type InductionInput = Omit<z.infer<typeof inductionInputSchema>, 'fit' | 'validation'> & { fit:Observation[]; validation:Observation[] };
export interface Candidate { id: string; ast: ExecutableRule; support: string[]; stems: string[]; contrasts: string[] }
export interface Outcome { id: string; correct: boolean; status: string; ruleIds: string[] }
export interface Scored { candidateIds: string[]; cost: number; lexiconBits: number; ruleBits: number; dataBits: number; outcomes: Outcome[] }
export interface InductionResult {
  version: typeof INDUCTION_VERSION; status: 'proposed' | 'insufficient' | 'ambiguous' | 'limit' | 'invalid'; diagnostics: string[];
  candidates: Candidate[]; rejected: { ast: ExecutableRule; reason: string }[]; alternatives: Scored[];
  proposals: Candidate[]; fitCount: number; validationCount: number; duplicatesRemoved: number; evaluations: number;
  validation?: { baseline: Outcome[]; selected: Outcome[]; ablations: { removed: string; outcomes: Outcome[] }[] };
}
export function ruleRecords(candidates: readonly Candidate[]): GrammarRule[] {
  return candidates.map(c => ({ id: c.id, executable: c.ast, rule: 'Grounded candidate', confidence: null, evidence: c.support, created_at: '1970-01-01T00:00:00.000Z' }));
}
export function lexemes(tree: MeaningTree): Lexeme[] {
  const nominal = (n: Nominal) => [n.head, ...n.adjectives];
  return tree.kind === 'nominal' ? nominal(tree.nominal) : [...nominal(tree.subject), tree.verb, ...(tree.object ? nominal(tree.object) : [])];
}
// Ignore object property insertion order, never semantic role/array order.
export function key(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(key).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([,v])=>v!==undefined).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k,v]) => JSON.stringify(k)+':'+key(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export type AnchorProfile = { dictionary: DictionaryEntry[]; lexical_policy?: LexicalPolicy };
