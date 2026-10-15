import { z } from 'zod';
import { entityIdSchema as id, timestampSchema as timestamp } from './common.js';
import { numberInputSchema, numeralValueSchema } from './numbers.js';

export const ELICITATION_HISTORY_LIMIT = 20;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const elicitationCreateSchema = z.strictObject({ expectedRevision: revision, mutationId: id });
export const elicitationDecisionSchema = z.strictObject({ expectedRevision: revision, mutationId: id,
  action: z.enum(['answer', 'decline']), answer: z.string().trim().min(1).max(128).nullable(), reason: z.string().trim().min(1).max(1200),
}).superRefine((d, ctx) => { if ((d.action === 'answer') !== (d.answer !== null)) ctx.addIssue({ code: 'custom', message: 'Only an answer decision supplies a form' }); });
export const elicitationSourceSchema = z.strictObject({ profile_id: id, profile_revision: revision, input: numberInputSchema,
  declined: z.array(numeralValueSchema).max(ELICITATION_HISTORY_LIMIT) });
export const elicitationReportSchema = z.strictObject({ version: z.literal('number-elicitation-session-1'),
  status: z.enum(['selected', 'none', 'invalid']), reason: z.string(), inferenceStatus: z.string(), inferenceReason: z.string(),
  leaderIds: z.array(z.string()).max(256), candidates: z.number().int().nonnegative(), fitCount: z.number().int().nonnegative(), validationCount: z.number().int().nonnegative(),
  considered: z.number().int().nonnegative(), eligible: z.number().int().nonnegative(), unavailable: z.number().int().nonnegative(),
  selection: z.strictObject({ value: numeralValueSchema, cost: z.number(), disagreementBits: z.number(), expectedRemaining: z.number(),
    groups: z.array(z.strictObject({ form: z.string().max(512), candidateIds: z.array(z.string()).max(256) })).max(256) }).nullable(),
});
export const elicitationRecordSchema = z.strictObject({ id, request_id: id, created_at: timestamp,
  source_json: z.string().max(40_000), source_sha256: hash, input_sha256: hash,
  report_json: z.string().max(180_000), report_sha256: hash, archived: z.boolean().optional(),
  decision: z.strictObject({ action: z.enum(['answer', 'decline']), answer: z.string().min(1).max(128).nullable(), reason: z.string().min(1).max(1200),
    mutation_id: id, digest: hash, created_at: timestamp, applied_revision: revision,
    observation_id: id.nullable(), after_json: z.string().max(180_000).nullable(), after_sha256: hash.nullable() }).nullable(),
});
export const elicitationHistorySchema = z.array(elicitationRecordSchema).max(ELICITATION_HISTORY_LIMIT).superRefine((records, ctx) => {
  const ids = records.flatMap(r => [r.id, r.request_id, ...(r.decision ? [r.decision.mutation_id] : [])]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate elicitation identity' });
  if (new TextEncoder().encode(JSON.stringify(records)).length > 2_000_000) ctx.addIssue({ code: 'custom', message: 'Elicitation history exceeds 2 MB' });
});
export type ElicitationRecord = z.infer<typeof elicitationRecordSchema>;
export type ElicitationReport = z.infer<typeof elicitationReportSchema>;
export type ElicitationSource = z.infer<typeof elicitationSourceSchema>;
export type ElicitationState = { id: string; stale: boolean; canDecide: boolean };
