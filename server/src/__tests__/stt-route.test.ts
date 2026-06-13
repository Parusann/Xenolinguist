import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';

afterEach(() => { delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL; });

describe('POST /api/stt', () => {
  it('returns 400 when no audio is given', async () => {
    const { createApp } = await import('../app.js?stt=1');
    const res = await request(createApp()).post('/api/stt').send({});
    expect(res.status).toBe(400);
  });

  it('returns 503 when whisper is unavailable', async () => {
    delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL;
    const { createApp } = await import('../app.js?stt=2');
    const res = await request(createApp())
      .post('/api/stt')
      .send({ audio: Buffer.from('not really wav').toString('base64') });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('stt-unavailable');
  });
});
