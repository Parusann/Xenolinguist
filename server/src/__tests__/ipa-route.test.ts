import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';

afterEach(() => { delete process.env.IPA_MODEL_DIR; });

/** Minimal but structurally-valid 44-byte RIFF/WAVE header (passes the route's WAV sanity check). */
function minimalWavBase64(): string {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.write('data', 36, 'ascii');
  return b.toString('base64');
}

describe('POST /api/ipa', () => {
  it('returns 400 when no audio is given', async () => {
    const { createApp } = await import('../app.js?ipa=1');
    const res = await request(createApp()).post('/api/ipa').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-WAV (garbage) payload', async () => {
    const { createApp } = await import('../app.js?ipa=3');
    const res = await request(createApp()).post('/api/ipa').send({ audio: Buffer.from('x').toString('base64') });
    expect(res.status).toBe(400);
  });

  it('returns 503 when the model is unavailable', async () => {
    delete process.env.IPA_MODEL_DIR;
    const { createApp } = await import('../app.js?ipa=2');
    const res = await request(createApp()).post('/api/ipa').send({ audio: minimalWavBase64() });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ipa-unavailable');
  });
});
