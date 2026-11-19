import { describe, expect, it } from 'vitest';
import { compareLexical } from '../comparison/lexical.js';
import type { LexicalComparisonInput } from '../../../shared/schemas/lexical-comparison.js';

const data: LexicalComparisonInput = { assumption: 'closed-bijective-inventory', forms: ['ka', 'tu', 'mi'],
  meanings: ['sun', 'water', 'moon'], anchors: [{ id: 'a1', form: 'ka', meaning: 'water' }], query: 'mi' };

describe('product lexical constraint proposals', () => {
  it('keeps unresolved candidates and cites the supplied anchors', () => {
    expect(compareLexical(data)).toMatchObject({ status: 'ambiguous', meanings: ['sun', 'moon'], evidenceIds: ['a1'], state: 'proposed' });
    expect(compareLexical({ ...data, anchors: [...data.anchors, { id: 'a2', form: 'tu', meaning: 'moon' }] }))
      .toMatchObject({ status: 'identified', meanings: ['sun'], evidenceIds: ['a1', 'a2'] });
    expect(compareLexical({ ...data, query: 'unknown' })).toMatchObject({ status: 'insufficient', meanings: [] });
  });
  it('detects contradictions in either direction of the declared mapping', () => {
    for (const anchor of [{ id: 'a2', form: 'ka', meaning: 'sun' }, { id: 'a2', form: 'tu', meaning: 'water' }])
      expect(compareLexical({ ...data, anchors: [...data.anchors, anchor] })).toMatchObject({ status: 'inconsistent', meanings: [] });
  });
  it('requires the explicit assumption and valid finite inventories', () => {
    expect(() => compareLexical({ ...data, assumption: undefined } as unknown as LexicalComparisonInput)).toThrow();
    expect(() => compareLexical({ ...data, forms: ['ka', 'ka', 'mi'] })).toThrow();
    expect(() => compareLexical({ ...data, meanings: ['sun', 'water'] })).toThrow();
  });
});
