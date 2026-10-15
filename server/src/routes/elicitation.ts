import { Router } from 'express';
import { ElicitationSessions } from '../services/elicitation-sessions.js';
export const elicitationRouter = Router();
const sessions = new ElicitationSessions();
elicitationRouter.get('/:profileId', async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await sessions.list(req.params.profileId)); } catch (error) { next(error); }
});
elicitationRouter.post('/:profileId', async (req, res, next) => {
  try { res.json({ profile: await sessions.create(req.params.profileId, req.body) }); } catch (error) { next(error); }
});
elicitationRouter.post('/:profileId/:recordId/decision', async (req, res, next) => {
  try { res.json({ profile: await sessions.decide(req.params.profileId, req.params.recordId, req.body) }); } catch (error) { next(error); }
});
