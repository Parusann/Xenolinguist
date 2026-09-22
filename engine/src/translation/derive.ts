import type { LanguageProfile } from '../../../shared/types.js';
import { Budget, BudgetExceeded, LIMITS, type TranslationResult } from '../grammar/ast.js';
import { compileGrammar } from '../grammar/transforms.js';
import { parseStructure } from '../grammar/parser.js';
import { analyzeMorphology, lexicalForms } from '../morphology/analyze.js';
import { sourceSpan } from '../text/spans.js';

export type GrammarProfile = Pick<LanguageProfile, 'dictionary' | 'grammar_rules' | 'lexical_policy'>;
export function derive(source: string, profile: GrammarProfile): TranslationResult {
  const budget = new Budget();
  let grammar;
  try { grammar = compileGrammar(profile.grammar_rules, profile.lexical_policy); }
  catch (error) { return { status: 'invalid-grammar', candidates: [], diagnostics: [String(error)], operations: budget.operations }; }
  try {
    budget.cap(source.length, LIMITS.source, 'Source length');
    // One optional terminal stop; internal punctuation and additional clauses are not discarded.
    const body = source.replace(/[.!?]\s*$/u, match => ' '.repeat(match.length));
    const tokens = [...body.matchAll(/\S+/gu)].map(match => sourceSpan(source, match.index, match.index + match[0].length));
    budget.cap(tokens.length, LIMITS.tokens, 'Token count');
    if (!tokens.length) return { status: 'unresolved', candidates: [], diagnostics: ['Enter a noun phrase or one supported clause.'], operations: budget.operations };
    const index = lexicalForms(profile.dictionary, grammar, budget);
    const analyses = tokens.map(token => analyzeMorphology(source, token, grammar, index, budget));
    const candidates = parseStructure(source, tokens, analyses, grammar, budget);
    return { status: candidates.length === 1 ? 'resolved' : candidates.length ? 'ambiguous' : 'unresolved', candidates,
      diagnostics: candidates.length ? [] : ['No complete licensed parse. Check lexical meanings, verb frames, typed rules and spacing; prose rules do not execute.'], operations: budget.operations };
  } catch (error) {
    if (!(error instanceof BudgetExceeded)) throw error;
    return { status: 'limit', candidates: [], diagnostics: [error.message, 'No unique result is claimed after a search limit.'], operations: budget.operations };
  }
}
