import { Router } from 'express';
import { IpaUnavailableError, IpaBadInputError } from '../services/ipa-phones.js';
import { runPhones } from '../services/phone-process.js';
import { jobs } from '../services/job-manager.js';
import { RuntimeError } from '../services/runtime-error.js';
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

  const controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(); }; res.once('close', abort);
  try {
    const job = jobs.submit('acoustic', 'Phone analysis', (signal, progress) => runPhones(wav, signal, () => progress({ status: 'Native phone process started' })), { signal: controller.signal });
    res.setHeader('X-Xeno-Job', job.id);
    const result = await job.promise;
    return res.json(result);
  } catch (err) {
    if (res.destroyed) return;
    if (err instanceof RuntimeError) return res.status(err.status).json({ error: err.message, code: err.code, requestId, retryable: true });
    if (err instanceof IpaBadInputError) return res.status(400).json({ error: 'invalid audio', code: 'IPA_UNSUPPORTED_INPUT', requestId, retryable: false });
    if (err instanceof IpaUnavailableError) return res.status(503).json({ error: 'ipa-unavailable', code: err.code, requestId, retryable: true });
    return res.status(500).json({ error: 'ipa-failed', code: 'IPA_INFERENCE_FAILED', requestId, retryable: true });
  } finally { res.off('close', abort); }
});
