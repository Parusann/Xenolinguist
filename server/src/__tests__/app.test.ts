import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import request from 'supertest';

let dist: string;

beforeAll(async () => {
  dist = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-dist-'));
  await fs.writeFile(path.join(dist, 'index.html'), '<!doctype html><title>Xeno</title>');
  process.env.CLIENT_DIST = dist;
});

afterAll(async () => {
  delete process.env.CLIENT_DIST;
  await fs.rm(dist, { recursive: true, force: true });
});

describe('SPA serving when CLIENT_DIST is set', () => {
  it('serves index.html at /', async () => {
    const { createApp } = await import('../app.js?spa=1');
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Xeno');
  });

  it('still serves the API as JSON', async () => {
    const { createApp } = await import('../app.js?spa=2');
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('falls back to index.html for unknown non-/api GET (SPA routing)', async () => {
    const { createApp } = await import('../app.js?spa=3');
    const res = await request(createApp()).get('/app/some/client/route');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Xeno');
  });

  it('returns 404 JSON for unknown /api routes', async () => {
    const { createApp } = await import('../app.js?spa=4');
    const res = await request(createApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});
