import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createLocalSession, validateSession, CSP } from '../middleware/local-session.js';

describe('local session boundary', () => {
  it('rejects anonymous and incorrect credentials before JSON or binary body parsing', async () => {
    const app = createApp(createLocalSession());
    for (const url of ['/api/health', '/API/profiles', '/Api/audio/stages', '/api/profiles', '/api/audio/stages', '/api/ipa', '/api/session']) {
      expect((await request(app).post(url).type('json').send('{invalid')).status).toBe(401);
    }
    expect((await request(app).post('/api/audio/stages').type('application/octet-stream').send(Buffer.from('audio'))).status).toBe(401);
    expect((await request(app).get('/api/health').set('X-Xeno-Session', 'b'.repeat(64))).status).toBe(401);
  });
  it.each(['evil.example', '127.0.0.1.evil.example', 'localhost', '127.0.0.1:1', '[::1]:3001'])('rejects hostile or incorrect host %s', async host => {
    const session = createLocalSession();
    expect((await request(createApp(session)).get('/api/health').set('Host', host).set('X-Xeno-Session', session.secret)).status).toBe(403);
  });
  it.each(['null', 'https://evil.example', 'http://localhost:5173', 'http://127.0.0.1:1'])('rejects unauthorized desktop origin %s even with a credential', async origin => {
    const session = createLocalSession();
    expect((await request(createApp(session)).get('/api/health').set('Origin', origin).set('X-Xeno-Session', session.secret)).status).toBe(403);
  });
  it('serves authorized requests with CSP and rejects cross-site metadata and stale secrets', async () => {
    const first = createLocalSession(), second = createLocalSession();
    expect(first.secret).not.toBe(second.secret);
    const ok = await request(createApp(first)).get('/api/health').set('X-Xeno-Session', first.secret);
    expect(ok.status).toBe(200); expect(ok.headers['content-security-policy']).toBe(CSP);
    expect(JSON.stringify(ok.body)).not.toContain(first.secret);
    expect((await request(createApp(first)).get('/api/health').set('X-Xeno-Session', first.secret).set('Sec-Fetch-Site', 'cross-site')).status).toBe(403);
    expect((await request(createApp(second)).get('/api/health').set('X-Xeno-Session', first.secret)).status).toBe(401);
  });
  it('requires explicit development pairing and does not honor development cookies in desktop mode', async () => {
    const session = createLocalSession('development'), app = createApp(session);
    const paired = await request(app).post('/api/session').send({ secret: session.secret });
    expect(paired.status).toBe(204);
    const cookie = paired.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Strict');
    expect((await request(app).get('/api/health').set('Cookie', cookie)).status).toBe(200);
    expect((await request(createApp({ ...session, mode: 'desktop' })).get('/api/health').set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).post('/api/session').set('Origin', 'https://evil.example').send({ secret: session.secret })).status).toBe(403);
  });
  it('does not echo or log pairing codes in malformed JSON diagnostics', async () => {
    const session = createLocalSession('development'), log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(createApp(session)).post('/api/session').type('json').send(`{"secret":"${session.secret}`);
      expect(response.status).toBe(400); expect(JSON.stringify(response.body)).not.toContain(session.secret);
      expect(JSON.stringify(log.mock.calls)).not.toContain(session.secret);
    } finally { log.mockRestore(); }
  });
  it.each([null, {}, { secret: 'short', mode: 'desktop' }, { secret: 'a'.repeat(64), mode: 'disabled' }])('rejects malformed launch configuration', input => {
    expect(() => validateSession(input)).toThrow('Invalid local session configuration');
  });
});
