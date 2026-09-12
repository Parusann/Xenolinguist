import { z } from 'zod';
import { timestampSchema } from './common.js';
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const metricSnapshotsSchema = z.array(z.strictObject({
  version: z.literal(1), revision: count, recorded_at: timestampSchema,
  counts: z.strictObject({ observations: count, assertedEntries: count, grammarNotes: count,
    competingForms: count, mappings1To20: count.max(20), ratedEntries: count }),
})).max(1000).superRefine((snapshots, ctx) => {
  snapshots.forEach((snapshot, i) => {
    if (i && snapshot.revision <= snapshots[i - 1].revision)
      ctx.addIssue({ code: 'custom', path: [i, 'revision'], message: 'Snapshot revisions must increase' });
  });
});
