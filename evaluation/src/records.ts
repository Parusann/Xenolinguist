import type { Input, Output } from './contracts.js';
import type { ScoredItem } from './metrics/accuracy.js';
export interface RunRecord {
  id: string; split: string; seed: number; datasetHash: string; method: string; observations: number; observationIds: string[];
  repetition: number; modelSeed: number | null; inputHash: string; input: Input; latencyMs: number; output: Output; items: ScoredItem[];
}
