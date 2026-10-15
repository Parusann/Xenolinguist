import { z } from 'zod';
import { entityIdSchema as id, timestampSchema as timestamp } from './common.js';
import { proposalRequestSchema } from './proposals.js';

export const REVIEW_LIMITS = { records: 20, snapshotChars: 512_000, runChars: 256_000, totalBytes: 2_000_000 } as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const proposalDecisionInputSchema = z.strictObject({ expectedRevision: z.number().int().nonnegative(), mutationId: id,
  action: z.enum(['accept', 'reject']), reason: z.string().trim().min(1).max(1200) });
export const proposalReviewSchema = z.strictObject({ id, created_at: timestamp, request: proposalRequestSchema,
  source_json: z.string().max(REVIEW_LIMITS.snapshotChars), source_sha256: hash,
  status: z.enum(['running', 'completed', 'failed', 'cancelled']), run_json: z.string().max(REVIEW_LIMITS.runChars).nullable(), run_sha256: hash.nullable(),
  error: z.strictObject({ code: z.string().max(100), message: z.string().max(500) }).nullable(),
  decision: z.strictObject({ action: z.enum(['accept', 'reject']), reason: z.string().min(1).max(1200), created_at: timestamp,
    mutation_id: id, digest: hash, applied_revision: z.number().int().positive(), hypothesis_id: id.nullable(), target_id: id.nullable() }).nullable(),
  archived: z.boolean().optional(),
}).superRefine((r, ctx) => {
  if ((r.run_json === null) !== (r.run_sha256 === null) || (r.status === 'completed') !== (r.run_json !== null && r.run_sha256 !== null) ||
    (['failed', 'cancelled'].includes(r.status)) !== (r.error !== null) || (r.decision && r.status !== 'completed'))
    ctx.addIssue({ code: 'custom', message: 'Proposal review state is inconsistent' });
});
export const proposalReviewsSchema = z.array(proposalReviewSchema).max(REVIEW_LIMITS.records).superRefine((records, ctx) => {
  if (new Set(records.map(r => r.id)).size !== records.length) ctx.addIssue({ code: 'custom', message: 'Duplicate proposal review' });
  if (records.reduce((n, r) => n + r.source_json.length + (r.run_json?.length ?? 0), 0) > REVIEW_LIMITS.totalBytes)
    ctx.addIssue({ code: 'custom', message: 'Proposal review history exceeds retention limit' });
});
export type ProposalReview = z.infer<typeof proposalReviewSchema>;
export type ProposalDecisionInput = z.infer<typeof proposalDecisionInputSchema>;
export interface ProposalReviewState { id: string; status: ProposalReview['status'] | 'interrupted'; stale: boolean; canAccept: boolean; acceptBlockReason: string | null; }
