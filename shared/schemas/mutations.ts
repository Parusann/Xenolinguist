import { z } from 'zod';
import { entityIdSchema } from './common.js';
import { profileDataSchema, dictionaryEntrySchema, grammarRuleSchema, sampleSchema, audioClipSchema, numberSystemSchema } from './profile.js';

export const collectionSchema = z.enum(['dictionary', 'grammar_rules', 'samples', 'audio_clips']);
export const profileFieldsSchema = profileDataSchema.pick({ name: true, description: true, phonetic_notes: true, is_sandbox: true, sandbox_difficulty: true, sandbox_session: true }).partial();
export const operationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('set-fields'), fields: profileFieldsSchema }),
  z.strictObject({ type: z.literal('set-numbers'), value: numberSystemSchema }),
  z.strictObject({ type: z.literal('put-word'), value: dictionaryEntrySchema }),
  z.strictObject({ type: z.literal('put-rule'), value: grammarRuleSchema }),
  z.strictObject({ type: z.literal('put-sample'), value: sampleSchema }),
  z.strictObject({ type: z.literal('put-clip'), value: audioClipSchema }),
  z.strictObject({ type: z.literal('remove'), collection: collectionSchema, id: entityIdSchema }),
]);
export const mutationSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), mutationId: entityIdSchema,
  operations: z.array(operationSchema).min(1).max(1000),
});
export type ProfileOperation = z.infer<typeof operationSchema>;
export type ProfileMutation = z.infer<typeof mutationSchema>;
