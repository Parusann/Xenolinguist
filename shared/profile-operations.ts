import type { LanguageProfile } from './types.js';
import type { ProfileOperation } from './schemas/mutations.js';
import { ProfileError } from './schemas/errors.js';

export const putCollections = { 'put-word': 'dictionary', 'put-rule': 'grammar_rules', 'put-sample': 'samples', 'put-clip': 'audio_clips' } as const;
/** Notebook deletion must not detach a recording retained by an immutable capture. */
export function removeSampleKeepingCaptures(profile: LanguageProfile, id: string): LanguageProfile {
  const audioId = profile.samples.find(sample => sample.id === id)?.audio_id ?? null;
  const samples = profile.samples.filter(sample => sample.id !== id);
  const retained = audioId && (samples.some(sample => sample.audio_id === audioId)
    || profile.research.observations.some(observation => observation.audio?.clip_id === audioId));
  return { ...profile, samples, audio_clips: audioId && !retained ? profile.audio_clips.filter(clip => clip.id !== audioId) : profile.audio_clips };
}
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
