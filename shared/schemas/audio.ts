import { z } from 'zod';
import { entityIdSchema, timestampSchema } from './common.js';
export const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
export const audioFileSchema = z.strictObject({ sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive().max(MAX_AUDIO_BYTES),
  mime: z.enum(['audio/wav', 'audio/webm']) });
export const audioAssetsSchema = z.strictObject({ original: audioFileSchema, analysis: audioFileSchema });
export const audioDraftMetadataSchema = z.strictObject({ profileId: entityIdSchema, sampleId: entityIdSchema,
  name: z.string().max(255), mime: z.string().max(100), createdAt: timestampSchema });
export type AudioDraftMetadata = z.infer<typeof audioDraftMetadataSchema>;
export const stagedAudioSchema = z.strictObject({ id: entityIdSchema, createdAt: timestampSchema,
  original: audioFileSchema, analysis: audioFileSchema.optional(), duration: z.number().positive().max(120).optional(),
  state: z.enum(['staged', 'retained']) });
export type StagedAudio = z.infer<typeof stagedAudioSchema>;
