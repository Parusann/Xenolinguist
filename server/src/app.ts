import express from 'express';
import cors from 'cors';
import path from 'path';
import { ollamaRouter } from './routes/ollama.js';
import { profilesRouter } from './routes/profiles.js';
import { aiRouter } from './routes/ai.js';
import audioRouter from './routes/audio.js';
import { ttsRouter } from './routes/tts.js';
import { sttRouter } from './routes/stt.js';
import { ipaRouter } from './routes/ipa.js';
import { errorHandler } from './middleware/error-handler.js';
import { clientDist } from './config.js';

export function createApp() {
  const app = express();

  // CORS only matters in dev (Vite at :5173 → API at :3001). The packaged app serves the
  // SPA and API from the same loopback origin (http://127.0.0.1:<port>), so CORS is moot there.
  if (process.env.NODE_ENV !== 'production') {
    app.use(cors({ origin: 'http://localhost:5173' }));
  }

  // Per-route JSON limits: only the base64-audio routes need a large body; everything else
  // gets a small limit to shrink the memory-amplification (DoS) surface.
  const small = express.json({ limit: '2mb' });
  const audioJson = express.json({ limit: '50mb' });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/ollama', small, ollamaRouter);
  app.use('/api/profiles', express.json({ limit: '10mb' }), profilesRouter);
  app.use('/api/ai', small, aiRouter);
  app.use('/api/audio', audioJson, audioRouter);
  app.use('/api/tts', small, ttsRouter);
  app.use('/api/stt', audioJson, sttRouter);
  app.use('/api/ipa', audioJson, ipaRouter);

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
