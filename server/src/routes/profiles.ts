import { Router, type RequestHandler } from 'express';
import { ProfileStore } from '../services/profile-store.js';
import { DEMO_LANGUAGE } from '../../../shared/demo-language.js';

export const profilesRouter = Router();
const store = new ProfileStore();

/** Wrap an async handler so a rejected promise reaches the error middleware. Express 4 does
 *  not forward async rejections automatically, so without this a store failure would hang the
 *  request and surface as an unhandled rejection. */
const asyncHandler = (fn: RequestHandler): RequestHandler => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

profilesRouter.get('/', asyncHandler(async (_req, res) => {
  const profiles = await store.list();
  res.json(profiles);
}));

// Create a pre-seeded demo language ("Eridian") so users can explore the workflow.
profilesRouter.post('/demo', asyncHandler(async (_req, res) => {
  const profile = await store.create(DEMO_LANGUAGE);
  res.status(201).json(profile);
}));

profilesRouter.get('/:id', asyncHandler(async (req, res) => {
  const profile = await store.get(String(req.params.id));
  if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }
  res.json(profile);
}));

profilesRouter.post('/', asyncHandler(async (req, res) => {
  const profile = await store.create(req.body);
  res.status(201).json(profile);
}));

profilesRouter.put('/:id', asyncHandler(async (req, res) => {
  const profile = await store.update(String(req.params.id), req.body);
  if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }
  res.json(profile);
}));

profilesRouter.delete('/:id', asyncHandler(async (req, res) => {
  await store.remove(String(req.params.id));
  res.status(204).end();
}));
