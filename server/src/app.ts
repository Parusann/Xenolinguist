import express from 'express';
import cors from 'cors';
import { ollamaRouter } from './routes/ollama.js';
import { profilesRouter } from './routes/profiles.js';
import { aiRouter } from './routes/ai.js';
import audioRouter from './routes/audio.js';
import { errorHandler } from './middleware/error-handler.js';

export const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/ollama', ollamaRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/audio', audioRouter);

app.use(errorHandler);
