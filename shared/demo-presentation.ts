import { DEMO_LANGUAGE, DEMO_VERSION } from './demo-language';

/** Presentation is derived from the seed, never a second translation dictionary. */
export { DEMO_VERSION };
export const DEMO_DICTIONARY = new Map(DEMO_LANGUAGE.dictionary.map(entry => [entry.alien_word, entry]));
export const DEMO_PHRASES = ['sample-1', 'sample-3', 'sample-5', 'sample-6'].map(id => {
  const sample = DEMO_LANGUAGE.samples.find(item => item.id === id)!;
  return { id, alien: sample.alien_text, translation: sample.english_translation,
    tokens: sample.alien_text.split(/\s+/).map(word => ({
      alien: word, gloss: DEMO_DICTIONARY.get(word)?.english_meaning ?? '[?]',
    })),
  };
});
export const DEMO_INPUT = DEMO_PHRASES[0].alien + '. ' + DEMO_PHRASES[1].alien + '.';

/** Deliberately exact, case-insensitive lookup. No grammar inference or model call. */
export function demoLookup(input: string) {
  return (input.match(/[^\s.,!?]+|[.,!?]/gu) ?? []).map(token => {
    const punctuation = /^[.,!?]$/.test(token);
    const entry = punctuation ? undefined : DEMO_DICTIONARY.get(token.toLowerCase());
    return { token, punctuation, entry, gloss: punctuation ? token : entry?.english_meaning ?? '[?]' };
  });
}
