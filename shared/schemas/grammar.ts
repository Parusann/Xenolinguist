import { z } from 'zod';

const affix = z.string().min(1).max(32).regex(/^[\p{L}\p{M}\p{N}'’ʼ‐‑-]+$/u, 'Use a nonempty affix without spaces');
const position = z.enum(['prefix', 'suffix']);
export const executableRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('plural-affix'), position, affix }),
  z.strictObject({ kind: z.literal('tense-affix'), position, affix, tense: z.enum(['past', 'future']) }),
  z.strictObject({ kind: z.literal('negation'), marker: z.string().min(1).max(32).regex(/^[\p{L}\p{M}\p{N}'’ʼ‐‑-]+$/u), position: z.enum(['before', 'after']) }),
  z.strictObject({ kind: z.literal('adjective-order'), position: z.enum(['before', 'after']) }),
  z.strictObject({ kind: z.literal('clause-order'), order: z.enum(['SVO', 'SOV', 'VSO']), arguments: z.union([z.literal(1), z.literal(2)]) }),
]);
