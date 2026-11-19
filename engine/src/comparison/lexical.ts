import { lexicalComparisonSchema, type LexicalComparisonInput, type LexicalComparisonResult } from '../../../shared/schemas/lexical-comparison.js';

/** Enumerate the query's remaining meanings under an explicitly declared finite bijection. */
export function compareLexical(input: LexicalComparisonInput): LexicalComparisonResult {
  const data = lexicalComparisonSchema.parse(input);
  const result: LexicalComparisonResult = { version: 'lexical-comparison-1', method: 'inventory-constraints-1',
    assumption: data.assumption, status: 'insufficient', meanings: [], evidenceIds: data.anchors.map(anchor => anchor.id), state: 'proposed' };
  const forward = new Map<string, string>(), reverse = new Map<string, string>();
  for (const anchor of data.anchors) {
    if ((forward.has(anchor.form) && forward.get(anchor.form) !== anchor.meaning) ||
        (reverse.has(anchor.meaning) && reverse.get(anchor.meaning) !== anchor.form))
      return { ...result, status: 'inconsistent' };
    forward.set(anchor.form, anchor.meaning);
    reverse.set(anchor.meaning, anchor.form);
  }
  if (!data.forms.includes(data.query)) return result;
  const known = forward.get(data.query);
  const meanings = known === undefined ? data.meanings.filter(meaning => !reverse.has(meaning)) : [known];
  if (meanings.length > 16) return result;
  return { ...result, status: meanings.length === 1 ? 'identified' : 'ambiguous', meanings };
}
