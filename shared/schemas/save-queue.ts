import { z } from 'zod';
import { profileSchema } from './profile.js';
import { entityIdSchema } from './common.js';
import { mutationSchema } from './mutations.js';

export const draftValueSchema = z.union([z.string().max(1_000_000), z.boolean()]);
export const queuedBatchSchema = z.strictObject({ id: entityIdSchema, before: profileSchema, after: profileSchema, sent: mutationSchema.optional() });
export const saveQueueRecordSchema = z.strictObject({
  profileId: entityIdSchema, base: profileSchema, batches: z.array(queuedBatchSchema).max(3),
  drafts: z.record(z.string().max(64), draftValueSchema),
}).superRefine((record, ctx) => {
  if (record.base.id !== record.profileId || record.batches.some(batch => batch.before.id !== record.profileId || batch.after.id !== record.profileId || (batch.sent && batch.sent.mutationId !== batch.id)))
    ctx.addIssue({ code: 'custom', message: 'Save queue identity mismatch' });
});
export type SaveQueueRecord = z.infer<typeof saveQueueRecordSchema>;
export type DraftValue = z.infer<typeof draftValueSchema>;
