import type { Status } from '../contracts.js';
export interface ScoredItem { id: string; kind: 'semantic' | 'lexical'; withheldForm: boolean; status: Status; correct: boolean; prediction: unknown; truth: unknown }
export function accuracy(items: ScoredItem[]) {
  const answered = items.filter(i => i.status === 'answered').length, correct = items.filter(i => i.correct).length;
  const statuses = Object.fromEntries((['answered', 'abstained', 'invalid', 'error', 'timeout'] as const).map(s => [s, items.filter(i => i.status === s).length]));
  return { total: items.length, correct, accuracy: items.length ? correct / items.length : null, coverage: items.length ? answered / items.length : null,
    selectiveAccuracy: answered ? correct / answered : null, statuses };
}
// Fixed independent PRNG for seed-clustered paired bootstrap. Never used to generate a language.
function random(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; }; }
export function pairedInterval(differences: number[], draws = 2000) {
  if (!differences.length) return null;
  const rng = random(150015), samples: number[] = [];
  for (let b = 0; b < draws; b++) {
    let sum = 0; for (let i = 0; i < differences.length; i++) sum += differences[Math.floor(rng() * differences.length)];
    samples.push(sum / differences.length);
  }
  samples.sort((a, b) => a - b);
  return { mean: differences.reduce((a, b) => a + b, 0) / differences.length, lower: samples[Math.floor(draws * 0.025)], upper: samples[Math.min(draws - 1, Math.floor(draws * 0.975))],
    languageCount: differences.length, draws, seed: 150015, method: 'paired language-cluster percentile bootstrap; repeated runs averaged within language' };
}
