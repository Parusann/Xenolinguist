import { Router } from 'express';
import { jobs } from '../services/job-manager.js';
export const jobsRouter = Router();
jobsRouter.get('/', (_req, res) => res.json({ jobs: jobs.list() }));
jobsRouter.delete('/:id', (req, res) => { if (!jobs.cancel(req.params.id)) return res.status(404).json({ error: 'Active job not found' }); res.status(202).json({ cancellationRequested: true }); });
