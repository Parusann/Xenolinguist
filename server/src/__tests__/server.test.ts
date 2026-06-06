import { describe, it, expect, afterEach } from 'vitest';

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (close) { await close(); close = null; }
  delete process.env.PORT;
});

describe('startServer', () => {
  it('listens on an OS-assigned free port and serves /api/health', async () => {
    process.env.PORT = '0';
    const { startServer } = await import('../index.js?srv=1');
    const handle = await startServer();
    close = handle.close;
    expect(handle.port).toBeGreaterThan(0);
    const res = await fetch(`http://127.0.0.1:${handle.port}/api/health`);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
