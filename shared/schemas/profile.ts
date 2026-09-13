import { z } from 'zod';
import { entityIdSchema as id, timestampSchema as timestamp, confidenceSchema, noteSchema as text } from './common.js';
import { ProfileError, validationError } from './errors.js';
import { audioAssetsSchema } from './audio.js';
import { sandboxSessionSchema } from './sandbox.js';
import { metricSnapshotsSchema } from './metrics.js';
import { aiHistorySchema } from './ai-history.js';

const manualConfidence = { confidence: confidenceSchema.nullable().default(null), user_asserted_confidence: confidenceSchema.nullable().optional() };
export const dictionaryEntrySchema = z.strictObject({
  id, alien_word: text, english_meaning: text,
  part_of_speech: z.enum(['noun', 'verb', 'adjective', 'pronoun', 'number', 'connector', 'particle', 'unknown']),
  ...manualConfidence, context: text, examples: z.array(text), notes: text, created_at: timestamp,
});
export const grammarRuleSchema = z.strictObject({ id, rule: text, evidence: z.array(text), ...manualConfidence, created_at: timestamp });
export const numberSystemSchema = z.strictObject({
  base: z.number().int().min(2).max(36).nullable(),
  mappings: z.record(z.string().regex(/^(0|[1-9]\d*)$/), text), operators: z.record(text, text),
});
export const audioSegmentSchema = z.strictObject({
  id, start: z.number().finite().nonnegative(), end: z.number().finite().positive(),
  label: text, dictionary_entry_id: id.nullable(),
});
export const audioClipSchema = z.strictObject({
  id, filename: text, duration: z.number().finite().positive(),
  waveform: z.array(z.number().finite().min(0).max(1)), segments: z.array(audioSegmentSchema), created_at: timestamp,
  assets: audioAssetsSchema.optional(),
});
export const sampleSchema = z.strictObject({
  id, alien_text: text, english_translation: text.nullable(), source: text, phonetic_notes: text,
  decoded: z.boolean(), audio_id: id.nullable(), ipa: text.nullable(), created_at: timestamp,
});
export const profileDataSchema = z.strictObject({
  name: text, description: text, phonetic_notes: text, is_sandbox: z.boolean(),
  sandbox_difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  sandbox_session: sandboxSessionSchema.nullable().optional(),
  ai_history: aiHistorySchema.optional(),
  dictionary: z.array(dictionaryEntrySchema), grammar_rules: z.array(grammarRuleSchema),
  number_system: numberSystemSchema, samples: z.array(sampleSchema), audio_clips: z.array(audioClipSchema),
});
const metadataSchema = { metric_snapshots: metricSnapshotsSchema.optional(), id, created_at: timestamp, updated_at: timestamp,
  schema_version: z.literal(2), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  recent_mutations: z.array(z.strictObject({ id, digest: z.string().regex(/^[a-f0-9]{64}$/), revision: z.number().int().nonnegative() })).max(128).default([]) };
export const profileObjectSchema = profileDataSchema.extend(metadataSchema);
export const profileSchema = profileObjectSchema.superRefine((profile, ctx) => {
  const ids = new Set<string>();
  const addId = (value: string, at: (string | number)[]) => {
    if (ids.has(value)) ctx.addIssue({ code: 'custom', path: at, message: 'Duplicate entity identifier' });
    ids.add(value);
  };
  const dictionaryIds = new Set(profile.dictionary.map(entry => entry.id));
  const clipIds = new Set(profile.audio_clips.map(clip => clip.id));
  for (const key of ['dictionary', 'grammar_rules', 'samples', 'audio_clips'] as const) {
    profile[key].forEach((entry, index) => addId(entry.id, [key, index, 'id']));
  }
  profile.samples.forEach((sample, i) => {
    if (sample.audio_id !== null && !clipIds.has(sample.audio_id))
      ctx.addIssue({ code: 'custom', path: ['samples', i, 'audio_id'], message: 'Referenced audio clip is missing' });
  });
  profile.audio_clips.forEach((clip, i) => clip.segments.forEach((segment, j) => {
    const at = ['audio_clips', i, 'segments', j];
    addId(segment.id, [...at, 'id']);
    if (segment.start >= segment.end || segment.end > clip.duration)
      ctx.addIssue({ code: 'custom', path: at, message: 'Segment must satisfy start < end <= clip duration' });
    if (segment.dictionary_entry_id !== null && !dictionaryIds.has(segment.dictionary_entry_id))
      ctx.addIssue({ code: 'custom', path: [...at, 'dictionary_entry_id'], message: 'Referenced dictionary entry is missing' });
  }));
});

const inputSchema = profileObjectSchema.partial();
export function parseProfilePatch(input: unknown): Partial<z.infer<typeof profileDataSchema>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  // Accept validated legacy-client metadata, but never let it change server-owned identity.
  const { id: _id, created_at: _created, updated_at: _updated, schema_version: _version, revision: _revision, recent_mutations: _ledger, metric_snapshots: _snapshots, ...data } = parsed.data;
  return data;
}
export function parseProfile(input: unknown): z.infer<typeof profileSchema> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  // Retain the legacy writable alias for saved drafts and older clients. Both fields represent optional user belief only.
  return { ...parsed.data,
    dictionary: parsed.data.dictionary.map(entry => ({ ...entry, user_asserted_confidence: entry.confidence })),
    grammar_rules: parsed.data.grammar_rules.map(rule => ({ ...rule, user_asserted_confidence: rule.confidence })),
  };
}

/** Pure migration shared by disk loading and import preview. Unknown fields fail validation instead of disappearing. */
export function migrateProfile(input: unknown): z.infer<typeof profileSchema> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProfileError('PROFILE_INVALID', 'Expected a profile object');
  const source = input as Record<string, unknown>;
  if (source.schema_version === 2) return parseProfile(source);
  if (source.schema_version !== undefined && source.schema_version !== 1)
    throw new ProfileError('PROFILE_VERSION_UNSUPPORTED', 'This profile requires a different application version', 422);
  const migrated: Record<string, unknown> = { description: '', phonetic_notes: '', is_sandbox: false, dictionary: [], grammar_rules: [],
    number_system: { base: null, mappings: {}, operators: {} }, samples: [], audio_clips: [], ...source,
    schema_version: 2, revision: 0 };
  // Only omitted historical optional fields are filled; malformed values remain errors.
  if (Array.isArray(migrated.samples)) migrated.samples = migrated.samples.map(sample =>
    sample && typeof sample === 'object' && !Array.isArray(sample) ? { ipa: null, audio_id: null, ...sample } : sample);
  return parseProfile(migrated);
}
