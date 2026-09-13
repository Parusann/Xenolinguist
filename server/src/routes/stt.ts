import { Router } from 'express';
import { transcribe, SttUnavailableError } from '../services/stt-whisper.js';
import { jobs } from '../services/job-manager.js';
import { RuntimeError } from '../services/runtime-error.js';

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

  const controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(); }; res.once('close', abort);
  try {
    const job = jobs.submit('acoustic', 'Transcription', signal => transcribe({ wav, language: lang, signal }), { signal: controller.signal });
    res.setHeader('X-Xeno-Job', job.id);
    const result = await job.promise;
    return res.json(result);
  } catch (err) {
    if (res.destroyed) return;
    if (err instanceof RuntimeError) return res.status(err.status).json({ error: err.message, code: err.code, retryable: true });
    if (err instanceof SttUnavailableError) {
      return res.status(503).json({ error: 'stt-unavailable' });
    }
    return res.status(500).json({ error: 'stt-failed' });
  } finally { res.off('close', abort); }
});
