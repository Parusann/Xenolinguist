import { Router, json, type RequestHandler } from 'express';
import path from 'node:path';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { ProjectArchives } from '../services/project-archive.js';
import { dataDir } from '../config.js';
import { archiveRestoreSchema } from '../../../shared/schemas/archive.js';
import { entityIdSchema } from '../../../shared/schemas/common.js';

export const archivesRouter = Router();
const archives = new ProjectArchives();
const asyncHandler = (fn: RequestHandler): RequestHandler => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const exportQuery = z.strictObject({ revision: z.coerce.number().int().nonnegative(), sandbox: z.enum(['true', 'false']) });

archivesRouter.get('/export/:id', asyncHandler(async (req, res) => {
  const id = entityIdSchema.parse(req.params.id), query = exportQuery.parse(req.query);
  await archives.exclusive(async () => {
    const exported = await archives.export(id, query.revision, query.sandbox === 'true');
    try { await new Promise<void>((resolve, reject) => res.download(exported.file, `project-${id}.xeno`, error => error ? reject(error) : resolve())); }
    finally { await exported.dispose(); }
  });
}));
archivesRouter.post('/inspect', asyncHandler(async (req, res) => {
  if (!req.is('application/octet-stream')) { res.status(415).json({ error: 'Upload a .xeno archive as application/octet-stream' }); return; }
  // Streaming request with a byte counter; never route archive bytes through JSON/base64 middleware.
  // Destroying an IncomingMessage in pipeline would also destroy the response socket on a limit error.
  const input = Readable.from(req.iterator({ destroyOnReturn: false }));
  try {
    const preview = await archives.exclusive(() => archives.inspect(input));
    res.status(201).json(preview);
  } finally { input.destroy(); if (!req.complete) req.resume(); }
}));
archivesRouter.post('/:token/restore', json({ limit: '2kb' }), asyncHandler(async (req, res) => {
  const options = archiveRestoreSchema.parse(req.body);
  res.status(201).json(await archives.exclusive(() => archives.restore(String(req.params.token), options)));
}));
archivesRouter.delete('/:token', asyncHandler(async (req, res) => {
  await archives.exclusive(() => archives.discard(String(req.params.token))); res.status(204).end();
}));
archivesRouter.get('/backups/:id', asyncHandler(async (req, res) => {
  const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}-[a-f0-9-]{36}\.xeno$/).parse(req.params.id);
  await new Promise<void>((resolve, reject) => res.download(path.join(dataDir(), 'archive-backups', id), id, error => error ? reject(error) : resolve()));
}));
