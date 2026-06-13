import { Router } from 'express';
import { synthesize, TtsUnavailableError } from '../services/tts-espeak.js';

export const ttsRouter = Router();

ttsRouter.post('/', async (req, res) => {
  const { text, phonemes, voice } = req.body ?? {};
  if (!text && !phonemes) {
    return res.status(400).json({ error: 'text or phonemes required' });
  }
  if ((text != null && typeof text !== 'string') || (phonemes != null && typeof phonemes !== 'string')) {
    return res.status(400).json({ error: 'text and phonemes must be strings' });
  }
  // Cap length to stay well under OS argv limits (espeak receives these as CLI args).
  if ((typeof text === 'string' && text.length > 5000) || (typeof phonemes === 'string' && phonemes.length > 5000)) {
    return res.status(400).json({ error: 'text too long' });
  }
  try {
    const wav = await synthesize({ text, phonemes, voice });
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', wav.length);
    return res.send(wav);
  } catch (err) {
    if (err instanceof TtsUnavailableError) {
      return res.status(503).json({ error: 'tts-unavailable' });
    }
    return res.status(500).json({ error: 'tts-failed' });
  }
});
