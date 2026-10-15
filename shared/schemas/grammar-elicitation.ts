import { z } from 'zod';
import { entityIdSchema as id } from './common.js';
import { elicitationCreateSchema, elicitationRecordSchema } from './elicitation-records.js';
import { meaningTreeSchema } from '../../engine/src/morphology/generate.js';

export const grammarSetupSchema = z.strictObject({
  candidates: z.array(z.strictObject({ id, rule_ids: z.array(id).max(64) })).min(2).max(32),
  anchors: z.array(meaningTreeSchema).min(1).max(16),
  available: z.array(z.strictObject({ kind: z.literal('meaning'), meaning: meaningTreeSchema, cost: z.number().finite().min(1).max(1000) })).min(1).max(64),
}).superRefine((s, ctx) => {
  if (new Set(s.candidates.map(c => c.id)).size !== s.candidates.length || s.candidates.some(c => new Set(c.rule_ids).size !== c.rule_ids.length))
    ctx.addIssue({ code: 'custom', message: 'Candidate and rule identities must be unique' });
});
export const grammarQuestionSchema = elicitationCreateSchema.extend({ setup: grammarSetupSchema });
export const grammarRecordSchema = elicitationRecordSchema.extend({ context_sha256: z.string().regex(/^[a-f0-9]{64}$/), request_sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const grammarHistorySchema = z.array(grammarRecordSchema).max(20).superRefine((records, ctx) => {
  const ids = records.flatMap(r => [r.id, r.request_id, ...(r.decision ? [r.decision.mutation_id] : [])]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate grammar elicitation identity' });
  if (new TextEncoder().encode(JSON.stringify(records)).length > 2_000_000) ctx.addIssue({ code: 'custom', message: 'Grammar elicitation history exceeds 2 MB' });
});
export type GrammarSetup = z.infer<typeof grammarSetupSchema>;
export type GrammarRecord = z.infer<typeof grammarRecordSchema>;
