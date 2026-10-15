import { testSession } from './authenticated-request.js';
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (close) { await close(); close = null; }
  delete process.env.PORT;
  delete process.env.DATA_DIR;
});

describe('startServer', () => {
  it('listens on an OS-assigned free port and serves /api/health', async () => {
    process.env.PORT = '0';
    process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), 'xeno-owner-test-'));
    const { startServer } = await import('../index.js?srv=1');
    const handle = await startServer(testSession);
    close = handle.close;
    expect(handle.port).toBeGreaterThan(0);
    const res = await fetch(`http://127.0.0.1:${handle.port}/api/health`, { headers: { 'X-Xeno-Session': testSession.secret } });
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
