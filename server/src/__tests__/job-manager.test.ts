import { expect, it, vi } from 'vitest';
import { JobManager } from '../services/job-manager.js';

it('bounds each queue and does not release a cancelled running slot before actual cleanup', async () => {
  const jobs = new JobManager(1), starts: string[] = [];
  let finish!: () => void;
  const first = jobs.submit('llm', 'first', signal => new Promise<void>(resolve => { starts.push('first'); signal.addEventListener('abort', () => { finish = resolve; }); }));
  await Promise.resolve();
  const second = jobs.submit('llm', 'second', async () => { starts.push('second'); });
  expect(() => jobs.submit('llm', 'overflow', async () => {})).toThrow('queue is full');
  const audio = jobs.submit('acoustic', 'parallel', async () => { starts.push('audio'); });
  await audio.promise;
  expect(jobs.cancel(first.id)).toBe(true); await Promise.resolve();
  expect(starts).toEqual(['first', 'audio']); expect(jobs.list()[0].state).toBe('running');
  finish(); await expect(first.promise).rejects.toMatchObject({ code: 'JOB_CANCELLED' }); await second.promise;
  expect(starts).toEqual(['first', 'audio', 'second']); expect(jobs.list()[0].state).toBe('cancelled');
});
it('cancels queued work without executing it and enforces a total deadline', async () => {
  const jobs = new JobManager(), queued = vi.fn();
  const first = jobs.submit('llm', 'deadline', signal => new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))), { deadlineMs: 30 });
  await Promise.resolve(); const second = jobs.submit('llm', 'queued', queued);
  jobs.cancel(second.id); await expect(second.promise).rejects.toMatchObject({ code: 'JOB_CANCELLED' });
  await expect(first.promise).rejects.toMatchObject({ code: 'JOB_DEADLINE' }); expect(queued).not.toHaveBeenCalled();
});
it('bounds retained metadata and records failures without retaining prompt payloads', async () => {
  const jobs = new JobManager(4, 3);
  for (let i = 0; i < 8; i++) await jobs.submit('llm', 'test', async () => 'private output').promise;
  const bad = jobs.submit('llm', 'failure', async () => { throw Error('private input'); });
  await expect(bad.promise).rejects.toThrow();
  expect(jobs.list()).toHaveLength(3); expect(JSON.stringify(jobs.list())).not.toContain('private');
});
