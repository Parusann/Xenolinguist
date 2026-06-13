import { Router } from 'express';
import { transcribe, SttUnavailableError } from '../services/stt-whisper.js';

export const sttRouter = Router();

sttRouter.post('/', async (req, res) => {
  const { audio, language } = req.body ?? {};
  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: 'audio (base64 wav) required' });
  }
  // Buffer.from(...,'base64') never throws; validate the decoded bytes instead.
  // A 44-byte RIFF header is the minimum real WAV, so this rejects empty/garbage
  // payloads (e.g. whitespace base64 like '====') before spawning whisper.
  const wav = Buffer.from(audio, 'base64');
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') {
    return res.status(400).json({ error: 'invalid audio' });
  }

  // Guard the language passed to the whisper CLI: only a 2-letter code or 'auto'; else auto-detect.
  const lang = typeof language === 'string' && /^(auto|[a-z]{2})$/.test(language) ? language : undefined;

  try {
    const result = await transcribe({ wav, language: lang });
    return res.json(result);
  } catch (err) {
    if (err instanceof SttUnavailableError) {
      return res.status(503).json({ error: 'stt-unavailable' });
    }
    return res.status(500).json({ error: 'stt-failed' });
  }
});
