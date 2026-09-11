import type { LanguageProfile } from './types.js';
import type { ProfileOperation } from './schemas/mutations.js';
import { ProfileError } from './schemas/errors.js';

export const putCollections = { 'put-word': 'dictionary', 'put-rule': 'grammar_rules', 'put-sample': 'samples', 'put-clip': 'audio_clips' } as const;
export function applyOperations(profile: LanguageProfile, operations: ProfileOperation[]): LanguageProfile {
  let result = structuredClone(profile);
  for (const operation of operations) {
    if (operation.type === 'set-fields') result = { ...result, ...operation.fields };
    else if (operation.type === 'set-numbers') result.number_system = operation.value;
    else if (operation.type === 'remove') {
      // References must be explicitly cleared in the same mutation before final validation.
      result = { ...result, [operation.collection]: result[operation.collection].filter(entry => entry.id !== operation.id) };
    } else {
      const collection = putCollections[operation.type];
      const entries = result[collection];
      const existing = entries.find(entry => entry.id === operation.value.id);
      if (existing && existing.created_at !== operation.value.created_at) throw new ProfileError('ENTITY_IDENTITY_IMMUTABLE', 'Entity creation time is immutable');
      result = { ...result, [collection]: existing
        ? entries.map(entry => entry.id === operation.value.id ? operation.value : entry)
        : [...entries, operation.value] };
    }
  }
  return result;
}
