import express, { type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { ATLAS_LIMITS } from '../../shared/schemas/atlas.js';
import type { AtlasConfig } from './config.js';
import { createAuth } from './auth.js';
import { atlasPool } from './db.js';
import { Datasets } from './datasets.js';
import { ObjectStore } from './objects.js';
import { AtlasError } from './errors.js';

function route(action: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { action(req, res, next).catch(next); };
}

export function createApp(config: AtlasConfig) {
  const pool = atlasPool(config.databaseUrl), authPool = atlasPool(config.authDatabaseUrl, 2);
  const auth = createAuth(config, authPool), datasets = new Datasets(pool, new ObjectStore(config.objects));
  const app = express();
  let draining = false;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (draining) return res.status(503).json({ error: 'stopping', message: 'The atlas is stopping. Retry after startup.' });
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Cache-Control': 'no-store' });
    if (req.headers.host !== new URL(config.origin).host ||
        (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== config.origin))
      return res.status(403).json({ error: 'origin', message: 'Use the configured atlas address.' });
    next();
  });
  app.get('/health', route(async (_req, res) => { await pool.query('SELECT 1'); res.json({ ready: true, service: 'xenolinguist-atlas', pid: process.pid }); }));
  app.all('/api/auth/*', toNodeHandler(auth));
  app.use(express.json({ limit: '12mb' }));
  app.use('/api', route(async (req, res, next) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) { res.status(401).json({ error: 'unauthenticated', message: 'Sign in to the atlas.' }); return; }
    res.locals.owner = session.user.id;
    res.locals.user = session.user;
    next();
  }));

  app.get('/api/me', route(async (_req, res) => res.json({ user: res.locals.user })));
  app.get('/api/status', route(async (_req, res) => res.json({ limits: ATLAS_LIMITS, sharing: 'private', trainingPermission: false })));
  app.get('/api/references', route(async (_req, res) => res.json((await pool.query(`SELECT s.id,s.version,s.sha256,s.url,s.license,s.attribution,
    (SELECT count(*)::int FROM atlas.reference_languages l WHERE l.source_id=s.id) AS languages,
    (SELECT count(*)::int FROM atlas.reference_entries e WHERE e.source_id=s.id) AS forms FROM atlas.reference_sources s ORDER BY s.id`)).rows)));
  app.get('/api/datasets', route(async (_req, res) => res.json(await datasets.list(res.locals.owner))));
  app.post('/api/datasets', route(async (req, res) => res.status(201).json(await datasets.create(res.locals.owner, req.body))));
  app.get('/api/datasets/:id', route(async (req, res) => res.json(await datasets.detail(res.locals.owner, req.params.id))));
  app.post('/api/datasets/:id/versions', route(async (req, res) => res.status(201).json(await datasets.upload(res.locals.owner, req.params.id, req.body))));
  app.delete('/api/datasets/:id', route(async (req, res) => res.json(await datasets.remove(res.locals.owner, req.params.id))));
  app.get('/api/versions/:id/entries', route(async (req, res) => res.json(await datasets.entries(res.locals.owner, req.params.id, Number(req.query.offset ?? 0)))));
  app.get('/api/versions/:id/download', route(async (req, res) => {
    const object = await datasets.download(res.locals.owner, req.params.id);
    const extensions: Record<string, string> = { 'text/csv': 'csv', 'application/json': 'json', 'text/plain': 'txt' };
    const extension = extensions[object.contentType] ?? 'txt';
    res.set({ 'Content-Type': object.contentType + '; charset=utf-8', 'Content-Disposition': `attachment; filename="language-evidence.${extension}"` }).send(object.bytes);
  }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not-found', message: 'Resource unavailable.' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AtlasError) { res.status(error.status).json({ error: error.code, message: error.message }); return; }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      res.status(400).json({ error: 'invalid-input', message: 'Check the submitted fields and file format.' }); return;
    }
    if ((error as { type?: string })?.type === 'entity.too.large') {
      res.status(413).json({ error: 'size-limit', message: 'The submitted request exceeds the upload limit.' }); return;
    }
    res.status(500).json({ error: 'operation-failed', message: 'The operation could not complete. Retry after checking the local server.' });
  });
  return { app, auth, datasets, drain: () => { draining = true; },
    close: async () => { await Promise.all([pool.end(), authPool.end()]); } };
}
