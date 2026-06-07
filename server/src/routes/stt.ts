import { Router } from 'express';
import { transcribe, SttUnavailableError } from '../services/stt-whisper.js';

export const sttRouter = Router();

sttRouter.post('/', async (req, res) => {
  const { audio, language } = req.body ?? {};
  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: 'audio (base64 wav) required' });
  }
  let wav: Buffer;
  try { wav = Buffer.from(audio, 'base64'); }
  catch { return res.status(400).json({ error: 'invalid base64 audio' }); }
  if (wav.length === 0) return res.status(400).json({ error: 'empty audio' });

  try {
    const result = await transcribe({ wav, language });
    return res.json(result);
  } catch (err) {
    if (err instanceof SttUnavailableError) {
      return res.status(503).json({ error: 'stt-unavailable' });
    }
    return res.status(500).json({ error: 'stt-failed' });
  }
});
