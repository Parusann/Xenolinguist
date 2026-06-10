import { Router } from 'express';
import { ProfileStore } from '../services/profile-store.js';
import { DEMO_LANGUAGE } from '../../../shared/demo-language.js';

export const profilesRouter = Router();
const store = new ProfileStore();

profilesRouter.get('/', async (_req, res) => {
  const profiles = await store.list();
  res.json(profiles);
});

// Create a pre-seeded demo language ("Eridian") so users can explore the workflow.
profilesRouter.post('/demo', async (_req, res) => {
  const profile = await store.create(DEMO_LANGUAGE);
  res.status(201).json(profile);
});

profilesRouter.get('/:id', async (req, res) => {
  const profile = await store.get(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  res.json(profile);
});

profilesRouter.post('/', async (req, res) => {
  const profile = await store.create(req.body);
  res.status(201).json(profile);
});

profilesRouter.put('/:id', async (req, res) => {
  const profile = await store.update(req.params.id, req.body);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  res.json(profile);
});

profilesRouter.delete('/:id', async (req, res) => {
  await store.remove(req.params.id);
  res.status(204).end();
});
