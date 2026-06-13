import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// Regression tests for the path-traversal hardening in routes/audio.ts and
// services/profile-store.ts: a request-controlled id must never escape its
// data directory via `..` or path separators.

let tmp = '';
afterEach(async () => {
  delete process.env.DATA_DIR;
  if (tmp) { await fs.rm(tmp, { recursive: true, force: true }); tmp = ''; }
});

/** Minimal but structurally-valid RIFF/WAVE bytes (passes the upload magic-byte check). */
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

describe('audio route id validation', () => {
  it('rejects an upload id containing path separators (400)', async () => {
    const { createApp } = await import('../app.js?pt=1');
    const res = await request(createApp())
      .post('/api/audio/upload')
      .send({ id: '../../evil', data: minimalWavBase64(), mimeType: 'audio/wav' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid id');
  });

  it('rejects content that is neither WAV nor WebM (400)', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-pt-'));
    process.env.DATA_DIR = tmp;
    const { createApp } = await import('../app.js?pt=5');
    const res = await request(createApp())
      .post('/api/audio/upload')
      .send({ id: 'clip_ABC-123', data: Buffer.from('not audio at all').toString('base64'), mimeType: 'audio/wav' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Unsupported audio format');
  });

  it('accepts a safe id and writes inside the audio dir', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-pt-'));
    process.env.DATA_DIR = tmp;
    const { createApp } = await import('../app.js?pt=2');
    const res = await request(createApp())
      .post('/api/audio/upload')
      .send({ id: 'clip_ABC-123', data: minimalWavBase64(), mimeType: 'audio/wav' });
    expect(res.status).toBe(200);
    expect(res.body.filename).toBe('clip_ABC-123.wav');
    await expect(fs.access(path.join(tmp, 'audio', 'clip_ABC-123.wav'))).resolves.toBeUndefined();
  });
});

describe('ProfileStore id validation', () => {
  it('get() returns null for a traversal id instead of reading outside profiles/', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-pt-'));
    process.env.DATA_DIR = tmp;
    const { ProfileStore } = await import('../services/profile-store.js?pt=3');
    const store = new ProfileStore();
    // A file an unguarded `../secret` id would resolve to (profilesDir()/../secret.json).
    await fs.writeFile(path.join(tmp, 'secret.json'), '{"name":"secret"}', 'utf-8');
    expect(await store.get('../secret')).toBeNull();
  });

  it('remove() ignores a traversal id and does not delete outside profiles/', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-pt-'));
    process.env.DATA_DIR = tmp;
    const { ProfileStore } = await import('../services/profile-store.js?pt=4');
    const store = new ProfileStore();
    const victim = path.join(tmp, 'victim.json');
    await fs.writeFile(victim, '{}', 'utf-8');
    await store.remove('../victim');
    await expect(fs.access(victim)).resolves.toBeUndefined();
  });
});
