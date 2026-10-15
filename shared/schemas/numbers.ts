import { z } from 'zod';

export const NUMBER_LIMITS = { value: 4095, observations: 64, form: 128, output: 512, depth: 16, nodes: 128, joiners: 8, candidates: 8192, retained: 256, questions: 512 } as const;
export const numeralValueSchema = z.number().int().min(0).max(NUMBER_LIMITS.value);
export const numberObservationSchema = z.strictObject({ value: numeralValueSchema, form: z.string().trim().min(1).max(NUMBER_LIMITS.form) });
export const numberInputSchema = z.strictObject({
  fit: z.array(numberObservationSchema).max(NUMBER_LIMITS.observations),
  validation: z.array(numberObservationSchema).max(NUMBER_LIMITS.observations).default([]),
  caseSensitive: z.boolean().default(false),
});
export const numberGrammarSchema = z.strictObject({
  base: z.number().int().min(2).max(36),
  kind: z.enum(['additive', 'multiplicative']),
  additionOrder: z.enum(['high-first', 'low-first']),
  multiplicationOrder: z.enum(['coefficient-first', 'base-first']),
  additionJoiner: z.string().max(12), multiplicationJoiner: z.string().max(12),
  atoms: z.record(z.string().regex(/^(0|[1-9]\d*)$/), z.string().min(1).max(NUMBER_LIMITS.form)),
}).superRefine((grammar, ctx) => {
  if (!grammar.atoms[grammar.base] || Object.keys(grammar.atoms).some(n => Number(n) > grammar.base))
    ctx.addIssue({ code: 'custom', message: 'Atoms must be grounded values at or below the base, including the base.' });
});
export type NumberObservation = z.infer<typeof numberObservationSchema>;
export type NumberGrammar = z.infer<typeof numberGrammarSchema>;
export type NumberInput = z.infer<typeof numberInputSchema>;
export type NumberExpression = { kind: 'atom'; value: number; form: string } |
  { kind: 'add' | 'multiply'; value: number; form: string; left: NumberExpression; right: NumberExpression };
