import type { LanguageProfile } from 'shared/types'
import type { ProfileOperation } from 'shared/schemas/mutations'
import { parseProfile } from 'shared/schemas/profile'

const collections = ['dictionary', 'grammar_rules', 'samples', 'audio_clips'] as const
const types = { dictionary: 'put-word', grammar_rules: 'put-rule', samples: 'put-sample', audio_clips: 'put-clip' } as const
const scalarFields = ['name', 'description', 'phonetic_notes', 'is_sandbox', 'sandbox_difficulty', 'sandbox_session', 'ai_history', 'lexical_policy'] as const
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Three-way merge only fields the user changed. Return conflicts instead of overwriting remote edits. */
export function rebaseChanges(before: LanguageProfile, after: LanguageProfile, current: LanguageProfile) {
  const result = structuredClone(current)
  const conflicts: string[] = []
  const mergeObject = (old: object, desired: object, remote: object, location: string) => {
    const a = old as Record<string, unknown>, b = desired as Record<string, unknown>, c = remote as Record<string, unknown>
    const merged = { ...c }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (key === 'user_asserted_confidence') continue // compatibility alias follows confidence
      if (equal(a[key], b[key])) continue
      if (!equal(c[key], a[key]) && !equal(c[key], b[key])) conflicts.push(`${location}.${key}`)
      if (key in b) merged[key] = b[key]
      else delete merged[key]
    }
    return merged
  }
  const fields = (profile: LanguageProfile) => Object.fromEntries(scalarFields.map(key => [key, profile[key]]))
  Object.assign(result, mergeObject(fields(before), fields(after), fields(current), 'profile'))
  result.number_system = mergeObject(before.number_system, after.number_system, current.number_system, 'number_system') as unknown as LanguageProfile['number_system']
  for (const collection of collections) {
    const old = new Map(before[collection].map(entry => [entry.id, entry]))
    const desired = new Map(after[collection].map(entry => [entry.id, entry]))
    const remote = new Map(current[collection].map(entry => [entry.id, entry]))
    for (const id of new Set([...old.keys(), ...desired.keys()])) {
      const a = old.get(id), b = desired.get(id), c = remote.get(id)
      if (equal(a, b)) continue
      if (!b) {
        if (c && !equal(a, c)) conflicts.push(`${collection}.${id}`)
        remote.delete(id)
      } else if (!a || !c) {
        if ((!a && c && !equal(b, c)) || (a && !c)) conflicts.push(`${collection}.${id}`)
        remote.set(id, b)
      } else remote.set(id, mergeObject(a, b, c, `${collection}.${id}`) as typeof b)
    }
    Object.assign(result, { [collection]: [...remote.values()] })
  }
  return { profile: result, conflicts }
}

export function diffOperations(before: LanguageProfile, after: LanguageProfile): ProfileOperation[] {
  const operations: ProfileOperation[] = []
  const fields: Record<string, unknown> = {}
  for (const field of scalarFields) if (!equal(before[field], after[field])) fields[field] = after[field]
  if (Object.keys(fields).length) operations.push({ type: 'set-fields', fields })
  if (!equal(before.number_system, after.number_system)) operations.push({ type: 'set-numbers', value: after.number_system })
  for (const collection of collections) {
    for (const entry of before[collection]) if (!after[collection].some(next => next.id === entry.id)) operations.push({ type: 'remove', collection, id: entry.id })
    for (const entry of after[collection]) {
      if (!equal(before[collection].find(old => old.id === entry.id), entry)) operations.push({ type: types[collection], value: entry } as ProfileOperation)
    }
  }
  return operations
}
export const validateView = (profile: LanguageProfile) => parseProfile(profile)
