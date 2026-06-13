import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';

afterEach(() => { delete process.env.IPA_MODEL_DIR; });

describe('POST /api/ipa', () => {
  it('returns 400 when no audio is given', async () => {
    const { createApp } = await import('../app.js?ipa=1');
    const res = await request(createApp()).post('/api/ipa').send({});
    expect(res.status).toBe(400);
  });

  it('returns 503 when the model is unavailable', async () => {
    delete process.env.IPA_MODEL_DIR;
    const { createApp } = await import('../app.js?ipa=2');
    const res = await request(createApp()).post('/api/ipa').send({ audio: Buffer.from('x').toString('base64') });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ipa-unavailable');
  });
});
