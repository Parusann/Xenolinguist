import type { DictionaryEntry } from '../../../shared/types.js';

export interface SenseAnalysis { entry: DictionaryEntry; sense: number | null; meaning: string; aliases: string[] }

export function sensesOf(entry: DictionaryEntry): SenseAnalysis[] {
  return entry.senses?.length
    ? entry.senses.map((sense, index) => ({ entry, sense: index, meaning: sense.meaning, aliases: sense.aliases }))
    : [{ entry, sense: null, meaning: entry.english_meaning, aliases: [] }];
}
