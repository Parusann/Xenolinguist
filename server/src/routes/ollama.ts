import { Router } from 'express';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

export const ollamaRouter = Router();

ollamaRouter.get('/status', async (_req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await response.json() as { models: { name: string }[] };
    const models = data.models?.map((m: { name: string }) => m.name) || [];
    res.json({ connected: true, models });
  } catch {
    res.json({ connected: false, models: [] });
  }
});

ollamaRouter.get('/models', async (_req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(503).json({ error: 'Ollama not available' });
  }
});
