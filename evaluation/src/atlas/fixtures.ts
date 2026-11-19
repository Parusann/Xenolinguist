import type { ComparisonInput, ReferenceLanguage } from '../../../shared/schemas/atlas-comparison.js';

/** Disjoint alphabets and equal-length words prevent script overlap or length from revealing the answer. */
export function syntheticComparison(seed: number, anchors = 24) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  const alphabet = [...'abcde'], encoded = [...'κλμνξ'];
  const words = new Set<string>();
  while (words.size < 30) words.add(Array.from({ length: 5 }, () => alphabet[Math.floor(random() * alphabet.length)]).join(''));
  const transform = (word: string) => [...word].map(unit => encoded[alphabet.indexOf(unit)]).join('');
  const reference: ReferenceLanguage = { id: 'related', name: 'Synthetic regular substitution', sourceId: 'synthetic-study-1',
    sourceSha256: '0'.repeat(64), sourceUrl: 'https://example.invalid/synthetic-study', license: 'CC0-1.0',
    attribution: 'Purpose-built synthetic evaluation fixture. No natural-language ancestry claim.', features: {},
    entries: [...words].map((form, i) => ({ id: 'r' + i, conceptId: 'concept-' + i, meaning: 'concept ' + i, form })) };
  const unrelated: ReferenceLanguage = { ...reference, id: 'unrelated', name: 'Synthetic unrelated control',
    entries: reference.entries.map(entry => ({ ...entry, id: 'u' + entry.id,
      form: Array.from({ length: 5 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('') })) };
  const input: ComparisonInput = { versionId: 'synthetic-' + seed, objectSha256: '1'.repeat(64), features: {},
    entries: reference.entries.slice(0, anchors).map(entry => ({ id: 'q' + entry.id, form: transform(entry.form), meaning: entry.meaning })) };
  return { input, reference, unrelated, transform };
}
