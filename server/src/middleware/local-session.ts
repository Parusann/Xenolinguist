import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export const SESSION_HEADER = 'x-xeno-session';
export const SESSION_COOKIE = 'xeno_dev_session';
export interface LocalSession { secret: string; mode: 'desktop' | 'development'; }
export function createLocalSession(mode: LocalSession['mode'] = 'desktop'): LocalSession {
  return { secret: randomBytes(32).toString('hex'), mode };
}
export function validateSession(input: unknown): LocalSession {
  const value = input as Partial<LocalSession> | null;
  if (!value || typeof value.secret !== 'string' || !/^[a-f0-9]{64}$/.test(value.secret) || !['desktop', 'development'].includes(value.mode ?? ''))
    throw new Error('Invalid local session configuration');
  return { secret: value.secret!, mode: value.mode! };
}
export function matchesSecret(value: unknown, secret: string) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    && timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(secret, 'hex'));
}
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'";

/** Runs before body parsers, including binary uploads. No request secrets are logged. */
export function localSessionBoundary(config: LocalSession): RequestHandler {
  const session = validateSession(config);
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
    const expectedHost = `127.0.0.1:${req.socket.localPort}`;
    if (req.headers.host !== expectedHost) { res.status(403).json({ error: 'Untrusted local host', code: 'LOCAL_HOST_REJECTED' }); return; }
    const origin = req.headers.origin;
    const allowedOrigin = origin === undefined || origin === `http://${expectedHost}`
      || (session.mode === 'development' && origin === 'http://localhost:5173');
    if (!allowedOrigin || req.headers['sec-fetch-site'] === 'cross-site') {
      res.status(403).json({ error: 'Untrusted request origin', code: 'LOCAL_ORIGIN_REJECTED' }); return;
    }
    // Express route matching is case-insensitive by default, so protect aliases too.
    const requestPath = req.path.toLowerCase();
    if (!requestPath.startsWith('/api/') && requestPath !== '/api') { next(); return; }
    res.setHeader('Cache-Control', 'no-store');
    // Development pairing is explicit and still requires the secret in its JSON body.
    if (req.path === '/api/session' && req.method === 'POST' && session.mode === 'development') { next(); return; }
    const cookie = session.mode === 'development'
      ? req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) : undefined;
    if (!matchesSecret(req.headers[SESSION_HEADER], session.secret) && !matchesSecret(cookie, session.secret)) {
      res.status(401).json({ error: 'Local session required', code: 'LOCAL_SESSION_REQUIRED' }); return;
    }
    next();
  };
}
