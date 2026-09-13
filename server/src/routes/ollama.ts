import { Router } from 'express';
import { getModelInventory, localOllamaUrl, clearModelCache, requireLocalModel } from '../services/ollama-runtime.js';
import { runtimeCapabilities } from '../services/runtime-capabilities.js';
import { jobs } from '../services/job-manager.js';
import { readNdjson } from '../services/ndjson.js';
import { RuntimeError } from '../services/runtime-error.js';

export const ollamaRouter = Router();
export const setupModels = [{ name: 'gemma4:e4b', approximateBytes: 9_610_000_000 }, { name: 'llama3.2:3b', approximateBytes: 2_020_000_000 }];
ollamaRouter.get('/status', async (_req, res, next) => { try { res.json(await getModelInventory()); } catch (error) { next(error); } });
ollamaRouter.get('/models', async (_req, res, next) => { try { res.json(await getModelInventory(true)); } catch (error) { next(error); } });
ollamaRouter.get('/capabilities', async (_req, res, next) => { try { res.json({ ...await runtimeCapabilities(), setupModels }); } catch (error) { next(error); } });
ollamaRouter.post('/pull', (req, res, next) => {
  const model = setupModels.find(item => item.name === req.body?.model);
  if (!model || req.body?.confirmed !== true) return res.status(400).json({ error: 'Choose a supported local model and confirm its download' });
  if (jobs.list().some(job => job.lane === 'download' && ['queued', 'running'].includes(job.state))) return res.status(409).json({ error: 'A model download is already active' });
  try {
    const job = jobs.submit('download', 'Download ' + model.name, async (signal, progress) => {
      const response = await fetch(localOllamaUrl() + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.name, stream: true }), redirect: 'error', signal });
      let complete = false;
      await readNdjson(response, record => {
        if (typeof record.status !== 'string') throw new RuntimeError('STREAM_INVALID', 'Invalid download progress');
        progress({ status: record.status.slice(0, 200), ...(Number.isFinite(record.completed) ? { completed: record.completed } : {}), ...(Number.isFinite(record.total) ? { total: record.total } : {}) });
        if (record.status === 'success') complete = true;
      }, signal, 60000);
      if (!complete) throw new RuntimeError('PULL_INCOMPLETE', 'Model download ended before completion');
      await requireLocalModel(model.name, signal); clearModelCache();
    }, { deadlineMs: 30 * 60 * 1000 });
    res.status(202).json({ jobId: job.id });
  } catch (error) { next(error); }
});
