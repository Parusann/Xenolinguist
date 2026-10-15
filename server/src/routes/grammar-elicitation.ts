import { Router } from 'express';
import { GrammarElicitationSessions } from '../services/grammar-elicitation-sessions.js';
export const grammarElicitationRouter = Router();
const sessions = new GrammarElicitationSessions();
grammarElicitationRouter.get('/:profileId', async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await sessions.list(req.params.profileId)); } catch (error) { next(error); }
});
grammarElicitationRouter.post('/:profileId', async (req, res, next) => {
  try { res.json({ profile: await sessions.create(req.params.profileId, req.body) }); } catch (error) { next(error); }
});
grammarElicitationRouter.post('/:profileId/:recordId/decision', async (req, res, next) => {
  try { res.json({ profile: await sessions.decide(req.params.profileId, req.params.recordId, req.body) }); } catch (error) { next(error); }
});
