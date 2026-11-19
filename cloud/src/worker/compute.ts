import { access } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { ATLAS_LIMITS } from '../../../shared/schemas/atlas.js';
import type { ComparisonInput, ComparisonReport, ReferenceLanguage } from '../../../shared/schemas/atlas-comparison.js';

export class ComputeError extends Error {
  constructor(readonly code: 'timeout' | 'interrupted' | 'processing-error') { super(code); }
}
export async function compute(input: ComparisonInput, references: ReferenceLanguage[], signal: AbortSignal, timeoutMs: number = ATLAS_LIMITS.jobMs): Promise<ComparisonReport> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > ATLAS_LIMITS.jobMs) throw new Error('Invalid worker time bound');
  const compiled = new URL('./comparison-thread.mjs', import.meta.url);
  const filename = await access(compiled).then(() => compiled, () => new URL('./comparison-thread.ts', import.meta.url));
  if (signal.aborted) throw new ComputeError(signal.reason === 'timeout' ? 'timeout' : 'interrupted');
  return new Promise((resolve, reject) => {
    const worker = new Worker(filename, { workerData: { input, references }, execArgv: filename.pathname.endsWith('.ts') ? ['--import', 'tsx'] : [],
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 } });
    let settled = false;
    const finish = (error?: Error, report?: ComparisonReport) => {
      if (settled) return; settled = true;
      clearTimeout(timeout); signal.removeEventListener('abort', interrupted);
      void worker.terminate().finally(() => error ? reject(error) : resolve(report!));
    };
    const interrupted = () => finish(new ComputeError(signal.reason === 'timeout' ? 'timeout' : 'interrupted'));
    const timeout = setTimeout(() => finish(new ComputeError('timeout')), timeoutMs);
    signal.addEventListener('abort', interrupted, { once: true });
    worker.once('message', (report: ComparisonReport) => finish(undefined, report));
    worker.once('error', () => finish(new ComputeError('processing-error')));
    worker.once('exit', () => { if (!settled) finish(new ComputeError('processing-error')); });
  });
}
