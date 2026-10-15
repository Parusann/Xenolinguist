import { inspectAudioWav, IpaBadInputError } from '../services/audio-wav.js';
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
  const wav = Buffer.from(audio, 'base64');
  try { inspectAudioWav(wav); }
  catch (error) {
    if (error instanceof IpaBadInputError) return res.status(400).json({ error: 'invalid audio', code: 'STT_UNSUPPORTED_INPUT' });
    throw error;
  }
  if (language !== undefined && (typeof language !== 'string' || !/^(auto|[a-z]{2})$/.test(language)))
    return res.status(400).json({ error: 'invalid language', code: 'STT_UNSUPPORTED_LANGUAGE' });
  const lang = language as string | undefined;

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
