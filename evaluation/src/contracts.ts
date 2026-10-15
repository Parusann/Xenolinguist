import { z } from 'zod';
import type { LearnerInput, Meaning } from '../../engine/src/types.js';

export const ENGINE_VERSION = 'xeno-baselines-1';
export const atoms = ['bird', 'robot', 'fox', 'child', 'see', 'follow', 'help', 'red', 'small'] as const;
export type Atom = typeof atoms[number];
// Public output contract, independent of the scorer and generator implementation.
const entity = z.strictObject({ noun: z.enum(['bird', 'robot', 'fox', 'child']), count: z.number().int().min(1).max(99),
  attributes: z.array(z.enum(['red', 'small'])).max(2).refine(a => new Set(a).size === a.length) });
export const predictionSchema = z.strictObject({ clauses: z.array(z.strictObject({ agent: entity, action: z.enum(['see', 'follow', 'help']), patient: entity,
  tense: z.enum(['present', 'past', 'future']), negated: z.boolean() })).min(1).max(2) });
export type Input = LearnerInput & { lexicalProbes: string[] };
export type Status = 'answered' | 'abstained' | 'invalid' | 'error' | 'timeout';
export interface Prediction { id: string; status: Status; meaning?: Meaning; detail?: string }
export interface LexicalPrediction { token: string; status: Status; value?: Atom }
export interface Output {
  predictions: Prediction[]; lexical: LexicalPrediction[];
  diagnostics: Record<string, unknown>;
}
export interface ModelSettings { name: string; temperature: number; num_ctx: number; num_predict: number; timeoutMs: number }
export interface Context { settings: ModelSettings; modelSeed: number; expectedDigest?: string; signal?: AbortSignal }
export type Adapter = (input: Input, context: Context) => Promise<Output>;
export const meaningKey = (meaning: Meaning) => JSON.stringify({ clauses: meaning.clauses.map(c => ({
  agent: { noun: c.agent.noun, count: c.agent.count, attributes: [...c.agent.attributes].sort() }, action: c.action,
  patient: { noun: c.patient.noun, count: c.patient.count, attributes: [...c.patient.attributes].sort() }, tense: c.tense, negated: c.negated,
})) });
