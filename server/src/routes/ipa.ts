import { Router } from 'express';
import { transcribePhones, IpaUnavailableError } from '../services/ipa-phones.js';

export const ipaRouter = Router();

ipaRouter.post('/', async (req, res) => {
  const { audio } = req.body ?? {};
  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: 'audio (base64 wav) required' });
  }
  let wav: Buffer;
  try { wav = Buffer.from(audio, 'base64'); }
  catch { return res.status(400).json({ error: 'invalid base64 audio' }); }
  if (wav.length === 0) return res.status(400).json({ error: 'empty audio' });

  try {
    const result = await transcribePhones({ wav });
    return res.json(result);
  } catch (err) {
    if (err instanceof IpaUnavailableError) return res.status(503).json({ error: 'ipa-unavailable' });
    return res.status(500).json({ error: 'ipa-failed' });
  }
});
