import type { Family, LanguageSpec } from '../../../engine/src/types.js';
import { GENERATOR_VERSION, prng, shuffle } from './prng.js';
import { PHONEMES, forms } from './phonology.js';
import { NOUNS, ACTIONS, ATTRIBUTES } from './semantics.js';
export const MARKERS = ['open', 'close', 'plural', 'past', 'future', 'not', 'and', 'add', 'multiply', 'radix'] as const;
export function language(seed: number, family?: Family, ambiguity: LanguageSpec['ambiguity'] = 'none', version: string = GENERATOR_VERSION): LanguageSpec {
  if (version !== GENERATOR_VERSION) throw new Error('Unsupported generator version');
  if (family !== undefined && !['SVO', 'SOV', 'VSO'].includes(family)) throw new Error('Unsupported structural family');
  if (!['none', 'noun-homophone'].includes(ambiguity)) throw new Error('Unsupported ambiguity condition');
  const random = prng(seed), words = shuffle(forms(), random);
  const keys = [...NOUNS, ...ACTIONS, ...ATTRIBUTES, ...MARKERS, ...Array.from({ length: 12 }, (_, i) => String(i))];
  const lexicon = Object.fromEntries(keys.map((key, i) => [key, words[i]]));
  if (ambiguity === 'noun-homophone') lexicon.robot = lexicon.bird;
  const spec: LanguageSpec = { version: GENERATOR_VERSION, seed, phonemes: PHONEMES, lexicon, ambiguity,
    family: family ?? (['SVO', 'SOV', 'VSO'] as const)[Math.floor(random() * 3)],
    adjectivePlacement: random() < 0.5 ? 'before' : 'after', numberBase: [4, 8, 10, 12][Math.floor(random() * 4)],
    features: { plural: true, tense: true, negation: true } };
  validateLanguage(spec); return spec;
}
export function validateLanguage(spec: LanguageSpec) {
  if (spec.version !== GENERATOR_VERSION || !Number.isInteger(spec.numberBase) || spec.numberBase < 2 || spec.numberBase > 12
    || !['SVO', 'SOV', 'VSO'].includes(spec.family) || !['before', 'after'].includes(spec.adjectivePlacement)
    || !['none', 'noun-homophone'].includes(spec.ambiguity)) throw new Error('Invalid language specification');
  const keys = [...NOUNS, ...ACTIONS, ...ATTRIBUTES, ...MARKERS, ...Array.from({ length: 12 }, (_, i) => String(i))];
  const seen = new Map<string, string>();
  for (const key of keys) {
    const value = spec.lexicon[key];
    if (!value || !/^[a-z]+$/.test(value)) throw new Error('Invalid lexeme');
    const previous = seen.get(value);
    if (previous && !(spec.ambiguity === 'noun-homophone' && previous === 'bird' && key === 'robot')) throw new Error('Lexicon collision');
    seen.set(value, key);
  }
}
