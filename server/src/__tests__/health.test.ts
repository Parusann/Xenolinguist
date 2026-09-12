import { describe, it, expect } from 'vitest';
import request, { testSession } from './authenticated-request.js';
import { createApp } from '../app.js';

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(createApp(testSession)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
