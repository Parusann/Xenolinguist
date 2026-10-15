import type { ExecutableRule, LexicalPolicy } from '../../../shared/types.js';
import type { SourceSpan } from '../text/spans.js';

export interface LicensedRule { id: string; ast: ExecutableRule }
export interface Grammar { rules: LicensedRule[]; policy: LexicalPolicy }
export interface Lexeme { entryId: string; sense: number | null; lemma: string; pos: 'noun' | 'pronoun' | 'verb' | 'adjective' }
export interface Nominal { head: Lexeme; plural: boolean; adjectives: Lexeme[]; englishPlural?: string }
export type MeaningTree = { kind: 'nominal'; nominal: Nominal } | {
  kind: 'clause'; subject: Nominal; verb: Lexeme; object?: Nominal; tense: 'present' | 'past' | 'future'; negated: boolean;
};
export interface DerivationStep extends SourceSpan { operation: string; ruleId?: string; entryId?: string; sense?: number | null }
export interface Derived { tree: MeaningTree; steps: DerivationStep[]; ruleIds: string[] }
export interface TranslationResult {
  status: 'resolved' | 'ambiguous' | 'unresolved' | 'limit' | 'invalid-grammar';
  candidates: Derived[]; diagnostics: string[]; operations: number;
}
export const LIMITS = Object.freeze({ source: 2048, tokens: 16, rules: 64, dictionary: 5000, form: 512,
  analyses: 32, candidates: 32, operations: 4096, morphologyDepth: 2, adjectives: 2 });
export class BudgetExceeded extends Error {}
export class Budget {
  operations = 0;
  tick() { if (++this.operations > LIMITS.operations) throw new BudgetExceeded('Derivation operation budget exceeded'); }
  cap(length: number, max: number, label: string) { if (length > max) throw new BudgetExceeded(`${label} limit exceeded (${max})`); }
}
