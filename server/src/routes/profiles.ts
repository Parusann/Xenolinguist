import { Router } from 'express';
import { ProfileStore } from '../services/profile-store.js';

export const profilesRouter = Router();
const store = new ProfileStore();

profilesRouter.get('/', async (_req, res) => {
  const profiles = await store.list();
  res.json(profiles);
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
