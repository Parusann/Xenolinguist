import express from 'express';
import cors from 'cors';
import path from 'path';
import { ollamaRouter } from './routes/ollama.js';
import { profilesRouter } from './routes/profiles.js';
import { aiRouter } from './routes/ai.js';
import audioRouter from './routes/audio.js';
import { ttsRouter } from './routes/tts.js';
import { errorHandler } from './middleware/error-handler.js';
import { clientDist } from './config.js';

export function createApp() {
  const app = express();

  // Single origin in the desktop build; dev keeps the Vite origin.
  app.use(cors({ origin: 'http://localhost:5173' }));
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/ollama', ollamaRouter);
  app.use('/api/profiles', profilesRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/audio', audioRouter);
  app.use('/api/tts', ttsRouter);

  // Unknown /api routes get a JSON 404 (never the SPA fallback).
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Production: serve the built SPA and fall back to index.html for client routes.
  const dist = clientDist();
  if (dist) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

// Back-compat for existing imports/tests that use a ready-made app.
export const app = createApp();
