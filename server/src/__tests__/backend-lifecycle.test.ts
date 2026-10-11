import { expect, it, vi } from 'vitest';
import { BackendLifecycle } from '../../../electron/backend-lifecycle.js';

it('invalidates crashed credentials and serializes explicit recovery without automatic loops', async () => {
  const changed = vi.fn(), lifecycle = new BackendLifecycle(changed);
  let exitFirst!: (message: string) => void;
  const first = vi.fn(async (exit: (message: string) => void) => { exitFirst = exit; return { port: 1234, secret: 'a'.repeat(64) }; });
  const one = lifecycle.start(first), two = lifecycle.start(first);
  expect(one).toBe(two); await one; expect(first).toHaveBeenCalledTimes(1);
  exitFirst('Stopped'); expect(lifecycle.connection).toBeNull(); expect(lifecycle.state.phase).toBe('unavailable');
  await Promise.resolve(); expect(first).toHaveBeenCalledTimes(1);
  await lifecycle.start(async () => ({ port: 2345, secret: 'b'.repeat(64) }));
  exitFirst('Old callback'); expect(lifecycle.connection?.port).toBe(2345);
});
it('keeps failed startup recoverable and rejects a process that exits before readiness', async () => {
  const lifecycle = new BackendLifecycle(() => {});
  await expect(lifecycle.start(async exit => { exit('Early exit'); return { port: 1234, secret: 'a'.repeat(64) }; })).rejects.toThrow('exited');
  expect(lifecycle.connection).toBeNull();
  await expect(lifecycle.start(async () => { throw new Error('Timed out'); })).rejects.toThrow('Timed out');
  expect(lifecycle.state).toEqual({ phase: 'unavailable', message: 'Timed out' });
  await lifecycle.start(async () => ({ port: 1234, secret: 'c'.repeat(64) }));
  expect(lifecycle.state.phase).toBe('running');
});
