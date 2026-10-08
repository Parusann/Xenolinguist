import { describe, it, expect, afterEach } from 'vitest';
import request, { testSession } from './authenticated-request.js';

afterEach(() => { delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL; });

import { readFileSync } from 'node:fs';
import path from 'node:path';
const wav = readFileSync(path.join(__dirname, 'fixtures/hello-16k.wav'));

describe('POST /api/stt', () => {
  it('rejects unsupported PCM geometry and malformed language before inference', async () => {
    const { createApp } = await import('../app.js');
    const app = createApp(testSession), stereo = Buffer.from(wav);
    stereo.writeUInt16LE(2, 22);
    expect((await request(app).post('/api/stt').send({ audio: stereo.toString('base64') })).status).toBe(400);
    expect((await request(app).post('/api/stt').send({ audio: wav.toString('base64'), language: '--help' })).status).toBe(400);
    const truncated = Buffer.from(wav.subarray(0, 44));
    expect((await request(app).post('/api/stt').send({ audio: truncated.toString('base64') })).status).toBe(400);
  });
  it('returns 400 when no audio is given', async () => {
    const { createApp } = await import('../app.js?stt=1');
    const res = await request(createApp(testSession)).post('/api/stt').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-WAV (garbage) payload', async () => {
    const { createApp } = await import('../app.js?stt=3');
    const res = await request(createApp(testSession))
      .post('/api/stt')
      .send({ audio: Buffer.from('not really wav').toString('base64') });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid audio');
  });

  it('returns 503 when whisper is unavailable', async () => {
    delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL;
    const { createApp } = await import('../app.js?stt=2');
    const res = await request(createApp(testSession))
      .post('/api/stt')
      .send({ audio: wav.toString('base64') });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('stt-unavailable');
  });
});
