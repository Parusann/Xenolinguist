import { z } from 'zod';
import { entityIdSchema as id } from './common.js';
import { executableRuleSchema } from './grammar.js';

export const PROPOSAL_LIMITS = Object.freeze({ tools: 4, calls: 6, outputPerCall: 1024, deadlineMs: 180_000,
  contextChars: 12_000, observations: 12, words: 16, rules: 8, samples: 8, tests: 12 });
const short = z.string().trim().min(1).max(512);
export const citationSchema = z.strictObject({ observation_id: id, annotation_id: id.nullable(),
  start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1).max(512),
  relation: z.enum(['supports', 'contradicts', 'ambiguous']) });
export const lexicalProposalSchema = z.strictObject({ kind: z.literal('lexical'), entry_id: id.nullable(),
  form: short, meaning: short, part_of_speech: z.enum(['noun', 'pronoun', 'verb', 'adjective']),
  verb_frame: z.enum(['intransitive', 'transitive']).nullable() });
export const ruleProposalSchema = z.strictObject({ kind: z.literal('grammar'), rule_id: id.nullable(), rule: executableRuleSchema });
export const observationRequestSchema = z.strictObject({ kind: z.literal('observation-request'), question: short,
  predictions: z.array(short).min(2).max(4) });
export const proposalContentSchema = z.discriminatedUnion('kind', [lexicalProposalSchema, ruleProposalSchema, observationRequestSchema]);
const fields = { scope: z.strictObject({ profile_id: id, revision: z.number().int().nonnegative() }),
  label: short, explanation: z.string().trim().min(1).max(1200), alternatives: z.array(short).min(1).max(3),
  citations: z.array(citationSchema).min(1).max(8) };
/** Model input has no status, provenance, validation, confidence or arbitrary executable text. */
export const researchProposalSchema = z.strictObject({ ...fields, content: proposalContentSchema });
export const proposalActionSchema = z.discriminatedUnion('tool', [
  z.strictObject({ tool: z.literal('search-observations'), query: short }),
  z.strictObject({ tool: z.literal('inspect-span'), observation_id: id, start: z.number().int().nonnegative(), end: z.number().int().positive() }),
  z.strictObject({ tool: z.literal('propose-lexeme'), proposal: z.strictObject({ ...fields, content: lexicalProposalSchema }) }),
  z.strictObject({ tool: z.literal('propose-rule'), proposal: z.strictObject({ ...fields, content: ruleProposalSchema }) }),
  z.strictObject({ tool: z.literal('test-hypothesis'), proposal: researchProposalSchema }),
  z.strictObject({ tool: z.literal('finish'), proposal: researchProposalSchema }),
]);
export const proposalRequestSchema = z.strictObject({ profile_id: id, expectedRevision: z.number().int().nonnegative(),
  query: z.string().trim().min(1).max(1200), model: z.string().min(1).max(200),
  validation_sample_ids: z.array(id).max(PROPOSAL_LIMITS.tests).refine(ids => new Set(ids).size === ids.length, 'Duplicate validation sample') });
export type ResearchProposal = z.infer<typeof researchProposalSchema>;
export type ProposalAction = z.infer<typeof proposalActionSchema>;
export type ProposalRequest = z.infer<typeof proposalRequestSchema>;
export interface ProposalCheck { sample_id: string; source: string; expected: string;
  before: { outcome: 'matches' | 'differs' | 'unresolved'; rendered: string | null };
  after: ProposalCheck['before']; regression: boolean; }
export interface ProposalValidation {
  definition: 'proposal-checks-1'; status: 'invalid' | 'falsified' | 'inconclusive' | 'compatible' | 'request';
  errors: string[]; limitations: string[]; checks: ProposalCheck[];
  references: { valid: number; total: number }; input_sha256: string; changes: string[];
}
