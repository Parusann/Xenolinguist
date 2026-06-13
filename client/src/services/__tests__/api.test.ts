import { describe, it, expect, vi, afterEach } from 'vitest';

// Regression test for the SSE error-propagation fix in services/api.ts: a
// server-emitted { error } frame must reject streamAI, not be swallowed by the
// malformed-JSON guard.

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function sseResponse(frames: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

describe('streamAI', () => {
  it('propagates a server-emitted error frame instead of swallowing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['data: {"error":"model missing"}\n\n'])));
    const { streamAI } = await import('../api.ts?case=err');
    const tokens: string[] = [];
    await expect(
      streamAI([{ role: 'user', content: 'hi' }], {}, (t) => tokens.push(t)),
    ).rejects.toThrow('model missing');
    expect(tokens).toEqual([]);
  });

  it('delivers tokens and stops on [DONE]', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      sseResponse(['data: {"token":"he"}\n\n', 'data: {"token":"llo"}\n\ndata: [DONE]\n\n']),
    ));
    const { streamAI } = await import('../api.ts?case=ok');
    const tokens: string[] = [];
    await streamAI([{ role: 'user', content: 'hi' }], {}, (t) => tokens.push(t));
    expect(tokens.join('')).toBe('hello');
  });

  it('skips a malformed (non-JSON) frame without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      sseResponse(['data: {not json}\n\n', 'data: {"token":"ok"}\n\ndata: [DONE]\n\n']),
    ));
    const { streamAI } = await import('../api.ts?case=malformed');
    const tokens: string[] = [];
    await streamAI([{ role: 'user', content: 'hi' }], {}, (t) => tokens.push(t));
    expect(tokens).toEqual(['ok']);
  });
});
