import { Router, type RequestHandler } from 'express';
import { CompilerSandbox } from '../services/compiler-sandbox.js';
export const compilerRouter = Router();
const sandbox = new CompilerSandbox();
const wrap = (fn: RequestHandler): RequestHandler => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
compilerRouter.get('/:id', wrap(async (req, res) => { res.json(await sandbox.get(String(req.params.id))); }));
compilerRouter.post('/:id', wrap(async (req, res) => { res.json(await sandbox.act(String(req.params.id), req.body)); }));
