import { Router } from 'express';
import { transcribePhones, IpaUnavailableError, IpaBadInputError } from '../services/ipa-phones.js';

export const ipaRouter = Router();

ipaRouter.post('/', async (req, res) => {
  const { audio } = req.body ?? {};
  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: 'audio (base64 wav) required' });
  }
  // Buffer.from(...,'base64') never throws; validate the decoded bytes instead.
  const wav = Buffer.from(audio, 'base64');
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') {
    return res.status(400).json({ error: 'invalid audio' });
  }

  try {
    const result = await transcribePhones({ wav });
    return res.json(result);
  } catch (err) {
    if (err instanceof IpaBadInputError) return res.status(400).json({ error: 'invalid audio' });
    if (err instanceof IpaUnavailableError) return res.status(503).json({ error: 'ipa-unavailable' });
    return res.status(500).json({ error: 'ipa-failed' });
  }
});
