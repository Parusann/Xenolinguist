import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';

afterEach(() => { delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL; });

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

describe('POST /api/stt', () => {
  it('returns 400 when no audio is given', async () => {
    const { createApp } = await import('../app.js?stt=1');
    const res = await request(createApp()).post('/api/stt').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-WAV (garbage) payload', async () => {
    const { createApp } = await import('../app.js?stt=3');
    const res = await request(createApp())
      .post('/api/stt')
      .send({ audio: Buffer.from('not really wav').toString('base64') });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid audio');
  });

  it('returns 503 when whisper is unavailable', async () => {
    delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL;
    const { createApp } = await import('../app.js?stt=2');
    const res = await request(createApp())
      .post('/api/stt')
      .send({ audio: minimalWavBase64() });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('stt-unavailable');
  });
});
