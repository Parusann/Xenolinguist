import { randomUUID } from 'node:crypto';
import type { JobLane, JobRecord } from '../../../shared/schemas/capabilities.js';
import { RuntimeError } from './runtime-error.js';

interface Entry { record: JobRecord; controller: AbortController; start: () => void; reject: (error: Error) => void; cleanup: () => void; }
/** One execution per lane; a cancellation keeps its slot until the executor actually exits. */
export class JobManager {
  private entries = new Map<string, Entry>();
  private active = new Set<JobLane>();
  constructor(private maxQueued = 4, private maxHistory = 100) {}
  list() { return [...this.entries.values()].map(e => ({ ...e.record })); }
  cancel(id: string, reason = new RuntimeError('JOB_CANCELLED', 'Work cancelled', 409)) {
    const entry = this.entries.get(id);
    if (!entry || !['queued', 'running'].includes(entry.record.state)) return false;
    entry.record.cancelRequested = true; entry.controller.abort(reason);
    if (entry.record.state === 'queued') { entry.record.state = 'cancelled'; entry.record.finishedAt = new Date().toISOString(); entry.record.error = reason.message; entry.cleanup(); entry.reject(reason); }
    return true;
  }
  submit<T>(lane: JobLane, task: string, execute: (signal: AbortSignal, progress: (value: NonNullable<JobRecord['progress']>) => void) => Promise<T>, options: { signal?: AbortSignal; deadlineMs?: number } = {}) {
    if (this.list().filter(job => job.lane === lane && job.state === 'queued').length >= this.maxQueued) throw new RuntimeError('QUEUE_FULL', 'The work queue is full. Retry after a job finishes.', 429);
    options.signal?.throwIfAborted();
    const controller = new AbortController(), id = randomUUID();
    const record: JobRecord = { id, lane, task, state: 'queued', createdAt: new Date().toISOString() };
    let resolve!: (value: T) => void, reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    // A caller can subscribe after receiving the handle without an unhandled rejection race.
    void promise.catch(() => {});
    const abort = () => this.cancel(id);
    const timer = setTimeout(() => this.cancel(id, new RuntimeError('JOB_DEADLINE', 'Work exceeded its total deadline', 408)), options.deadlineMs ?? 180_000);
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
    const entry: Entry = { record, controller, reject, cleanup, start: () => {
      this.active.add(lane); record.state = 'running'; record.startedAt = new Date().toISOString();
      void (async () => {
        try {
          controller.signal.throwIfAborted();
          const result = await execute(controller.signal, progress => { record.progress = progress; });
          controller.signal.throwIfAborted(); record.state = 'succeeded'; resolve(result);
        } catch (error) {
          record.state = controller.signal.aborted ? 'cancelled' : 'failed';
          const failure = controller.signal.aborted ? controller.signal.reason : error;
          record.error = failure instanceof RuntimeError ? failure.message : 'Work failed'; reject(failure);
        } finally {
          record.finishedAt = new Date().toISOString(); cleanup(); this.active.delete(lane); this.pump(); this.trim();
        }
      })();
    } };
    this.entries.set(id, entry); options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    queueMicrotask(() => this.pump()); this.trim();
    return { id, promise };
  }
  private pump() { for (const entry of this.entries.values()) if (entry.record.state === 'queued' && !this.active.has(entry.record.lane)) entry.start(); }
  private trim() { for (const [id, entry] of this.entries) if (this.entries.size > this.maxHistory && entry.record.finishedAt) this.entries.delete(id); }
}
export const jobs = new JobManager();
