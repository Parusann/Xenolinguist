import { Router } from 'express';
import { ollamaBaseUrl } from '../config.js';

export const ollamaRouter = Router();

ollamaRouter.get('/status', async (_req, res) => {
  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/tags`);
    if (!response.ok) return res.json({ connected: false, models: [] });
    const data = await response.json() as { models?: { name: string }[] };
    const models = data.models?.map((m) => m.name) ?? [];
    res.json({ connected: true, models });
  } catch {
    res.json({ connected: false, models: [] });
  }
});

ollamaRouter.get('/models', async (_req, res) => {
  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/tags`);
    if (!response.ok) return res.status(503).json({ error: 'Ollama not available' });
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(503).json({ error: 'Ollama not available' });
  }
});
