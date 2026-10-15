import type { LexicalPolicy } from '../../../shared/types.js';

export const DEFAULT_LEXICAL_POLICY: Readonly<LexicalPolicy> = Object.freeze({
  caseSensitive: false, apostrophes: 'internal', hyphens: 'internal', segmentation: 'whitespace',
});

/** Lookup only. Never replace source text or infer offsets from this string. */
export function normalize(text: string, policy: LexicalPolicy = DEFAULT_LEXICAL_POLICY): string {
  const nfc = text.normalize('NFC');
  return (policy.caseSensitive ? nfc : nfc.toLowerCase()).normalize('NFC');
}

/** New forms retain case and spelling; normalization is for comparison only. */
export function storedForm(text: string): string { return text.trim(); }
