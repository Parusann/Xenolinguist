import type { GrammarRule, LexicalPolicy } from '../../../shared/types.js';
import { executableRuleSchema } from '../../../shared/schemas/grammar.js';
import { DEFAULT_LEXICAL_POLICY } from '../text/normalize.js';
import { LIMITS, type Grammar } from './ast.js';

/** Compile data only. Notebook prose is never interpreted as executable code. */
export function compileGrammar(records: readonly GrammarRule[], policy: LexicalPolicy = DEFAULT_LEXICAL_POLICY): Grammar {
  if (records.length > LIMITS.rules) throw new Error(`Grammar supports at most ${LIMITS.rules} records`);
  const rules: Grammar['rules'] = [];
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error('Duplicate grammar rule identifier');
    ids.add(record.id);
    if (record.executable == null) continue;
    const parsed = executableRuleSchema.safeParse(record.executable);
    if (!parsed.success) throw new Error(`Invalid executable rule ${record.id}: ${parsed.error.issues[0].message}`);
    rules.push({ id: record.id, ast: parsed.data });
  }
  return { rules, policy };
}

export function clauseRoles(order: 'SVO' | 'SOV' | 'VSO', argumentsCount: 1 | 2): string[] {
  return [...order].filter(role => argumentsCount === 2 || role !== 'O');
}
