import type { DictionaryEntry } from 'shared/types'
type Fields = Pick<DictionaryEntry, 'senses' | 'form_aliases' | 'verb_frame' | 'english_plural'>
const lines = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))]
export function cleanLexicalFields(fields: Fields): Fields {
  return { verb_frame: fields.verb_frame, english_plural: fields.english_plural?.trim() || null, form_aliases: lines(fields.form_aliases ?? []), senses: (fields.senses ?? []).map(sense => ({ meaning: sense.meaning.trim(), aliases: lines(sense.aliases) })) }
}
export function validLexicalFields(fields: Fields): boolean {
  const cleaned = cleanLexicalFields(fields)
  const validLines = (values: string[]) => values.length <= 64 && values.every(value => value.length <= 512)
  return validLines(cleaned.form_aliases!) && cleaned.senses!.length <= 64 && cleaned.senses!.every(sense => sense.meaning.length > 0 && sense.meaning.length <= 512 && validLines(sense.aliases))
}
