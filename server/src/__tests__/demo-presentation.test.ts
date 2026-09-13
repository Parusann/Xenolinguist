import { describe, expect, it } from 'vitest';
import { DEMO_LANGUAGE, DEMO_VERSION } from '../../../shared/demo-language.js';
import { DEMO_DICTIONARY, DEMO_PHRASES, demoLookup } from '../../../shared/demo-presentation.js';

describe('shared Eridian presentation', () => {
  it('uses the app seed for every displayed gloss and sentence interpretation', () => {
    expect(DEMO_LANGUAGE.description).toContain(DEMO_VERSION);
    for (const phrase of DEMO_PHRASES) {
      const sample = DEMO_LANGUAGE.samples.find(item => item.id === phrase.id)!;
      expect(phrase.translation).toBe(sample.english_translation);
      expect(phrase.alien).toBe(sample.alien_text);
      expect(phrase.tokens.map(token => token.alien).join(' ')).toBe(sample.alien_text);
      for (const token of phrase.tokens) {
        expect(DEMO_DICTIONARY.has(token.alien)).toBe(true);
        expect(token.gloss).toBe(DEMO_DICTIONARY.get(token.alien)?.english_meaning);
      }
    }
  });
  it('preserves known meanings, punctuation and unresolved words without fabricated confidence', () => {
    const result = demoLookup('NESH, tor! missing');
    expect(result.map(item => item.gloss)).toEqual(['star / light', ',', 'sky', '!', '[?]']);
    expect(result.at(-1)?.entry).toBeUndefined();
    expect(demoLookup('')).toEqual([]);
  });
});
