import type { Input, Output } from '../contracts.js';
import { induce, lexicalConsensus } from './symbolic.js';

/** Frozen from TranslationEngine.tsx at 621eebc. Intentionally retains its Unicode defect. */
export function lookup(text: string, dictionary: { alien_word: string; english_meaning: string }[]) {
  return text.trim().split(/\s+/).map(word => {
    const clean = word.toLowerCase().replace(/[^a-zA-ZÀ-ɏ'-]/g, '');
    const entry = dictionary.find(e => e.alien_word.toLowerCase() === clean);
    return { alien: word, english: entry?.english_meaning ?? null, punctuation: clean.length === 0 };
  });
}
/** Controlled composition ablation: grant the same inferred dictionary, disable composition. */
export async function exactLookup(input: Input): Promise<Output> {
  const hypotheses = induce(input), lexical = lexicalConsensus(input, hypotheses);
  const dictionary = Object.entries(hypotheses[0]?.lexicon ?? {}).filter(([key, token]) => hypotheses.every(h => h.lexicon[key] === token))
    .map(([english_meaning, alien_word]) => ({ alien_word, english_meaning }));
  return { predictions: input.challenges.map(c => ({ id: c.id, status: 'abstained', detail: 'Word lookup supplies glosses, not semantic trees' })),
    lexical: lexical.map(p => {
      const found = lookup(p.token, dictionary)[0].english;
      return p.status === 'answered' && found === p.value ? p : { token: p.token, status: 'abstained' };
    }), diagnostics: { modelUsed: false, dictionarySource: 'unanimous inferred bindings; no manual/oracle entries',
      glosses: input.challenges.map(c => ({ id: c.id, text: lookup(c.utterance, dictionary).map(t => t.punctuation ? t.alien : t.english ?? `[${t.alien}]`).join(' ') })) } };
}
