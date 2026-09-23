import type { ExecutableRule } from '../../../shared/types.js';
import type { AnchorProfile, Observation } from './contracts.js';
import { key } from './contracts.js';

/** Version 1 two-part byte code. Eight bits per UTF-8 byte; positive integer length
 * uses Elias gamma. Exceptions encode the full surface and grounded meaning. */
export const integerBits = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Code length requires a positive safe integer');
  return 2 * Math.floor(Math.log2(value)) + 1;
};
export const literalBits = (value: string): number => { const n = new TextEncoder().encode(value).length; return integerBits(n + 1) + n * 8; };
export const ruleBits = (rule: ExecutableRule): number => literalBits(key(rule));
export const lexiconBits = (profile: AnchorProfile): number => literalBits(key(profile.dictionary.map(e => ({ form:e.alien_word, aliases:e.form_aliases ?? [], meaning:e.english_meaning, senses:e.senses ?? [], pos:e.part_of_speech, frame:e.verb_frame ?? null })).sort((a,b)=>key(a).localeCompare(key(b),'en'))));
export const exceptionBits = (observation: Observation): number => 1 + literalBits(observation.surface) + literalBits(key(observation.meaning));
export const explainedBits = (tokens: number, entries: number, rules: number): number => 1 + integerBits(tokens + 1) + tokens * Math.ceil(Math.log2(entries + rules + 1));
