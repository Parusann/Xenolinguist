import type { LanguageSpec, Meaning } from '../../../engine/src/types.js';
import { canonicalEnglish, normalizeMeaning, semanticKey } from './semantics.js';
import { parseUtterance, utterance } from './grammar.js';
export function compile(input: Meaning, spec: LanguageSpec) {
  const truth = normalizeMeaning(input), surface = utterance(truth, spec);
  if (spec.ambiguity !== 'none') throw new Error('Clean compiler output requires unambiguous lexicon');
  if (semanticKey(parseUtterance(surface, spec)) !== semanticKey(truth)) throw new Error('Compiler round-trip invariant failed');
  return { utterance: surface, english: canonicalEnglish(truth), truth };
}
