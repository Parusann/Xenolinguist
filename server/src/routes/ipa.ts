import { Router } from 'express';
import { transcribePhones, IpaUnavailableError, IpaBadInputError } from '../services/ipa-phones.js';
import { randomUUID } from 'node:crypto';

export const ipaRouter = Router();

ipaRouter.post('/', async (req, res) => {
  const requestId = randomUUID();
  const { audio } = req.body ?? {};
  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: 'audio (base64 wav) required', code: 'IPA_UNSUPPORTED_INPUT', requestId, retryable: false });
  }
  // Buffer.from(...,'base64') never throws; validate the decoded bytes instead.
  const wav = Buffer.from(audio, 'base64');
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') {
    return res.status(400).json({ error: 'invalid audio', code: 'IPA_UNSUPPORTED_INPUT', requestId, retryable: false });
  }

  try {
    const result = await transcribePhones({ wav });
    return res.json(result);
  } catch (err) {
    if (err instanceof IpaBadInputError) return res.status(400).json({ error: 'invalid audio', code: 'IPA_UNSUPPORTED_INPUT', requestId, retryable: false });
    if (err instanceof IpaUnavailableError) return res.status(503).json({ error: 'ipa-unavailable', code: err.code, requestId, retryable: true });
    return res.status(500).json({ error: 'ipa-failed', code: 'IPA_INFERENCE_FAILED', requestId, retryable: true });
  }
});
