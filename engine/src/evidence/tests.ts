import type { ResearchAnalysis } from '../../../shared/types.js';
import { renderEnglish } from '../translation/render.js';

/** An explicit user-supplied target check, not a held-out benchmark or calibrated probability. */
export function checkSuppliedTarget(run: ResearchAnalysis, expected: string): 'matches' | 'differs' | 'unresolved' {
  if (run.result.status !== 'resolved' || run.result.candidates.length !== 1) return 'unresolved';
  const output = renderEnglish(run.result.candidates[0].tree);
  if (output.status !== 'rendered') return 'unresolved';
  const normalized = (s: string) => s.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
  return normalized(output.text) === normalized(expected) ? 'matches' : 'differs';
}
