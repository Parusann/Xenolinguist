import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Cover the 200 audio/wav success contract, voice passthrough, and the phonemes-only branch
// by mocking the espeak service (real synthesis is gated/skipped on CI — see tts.test.ts).
const synthesize = vi.fn();
vi.mock('../services/tts-espeak.js', () => ({
  synthesize: (...args: unknown[]) => synthesize(...args),
  TtsUnavailableError: class TtsUnavailableError extends Error {},
}));

beforeEach(() => { synthesize.mockReset(); });

describe('POST /api/tts (success contract)', () => {
  it('returns audio/wav on success', async () => {
    synthesize.mockResolvedValue(Buffer.from('RIFFfakeWAVE'));
    const { createApp } = await import('../app.js?ttsok=1');
    const res = await request(createApp()).post('/api/tts').send({ text: 'hello' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/wav');
  });

  it('passes the voice through to synthesize', async () => {
    synthesize.mockResolvedValue(Buffer.from('RIFF'));
    const { createApp } = await import('../app.js?ttsok=2');
    await request(createApp()).post('/api/tts').send({ text: 'hi', voice: 'de' });
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ text: 'hi', voice: 'de' }));
  });

  it('accepts a phonemes-only request', async () => {
    synthesize.mockResolvedValue(Buffer.from('RIFF'));
    const { createApp } = await import('../app.js?ttsok=3');
    const res = await request(createApp()).post('/api/tts').send({ phonemes: 'h@l@U' });
    expect(res.status).toBe(200);
    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ phonemes: 'h@l@U' }));
  });
});
