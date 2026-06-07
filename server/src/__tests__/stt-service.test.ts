import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

afterEach(() => { delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL; });

describe('stt-whisper.transcribe', () => {
  it('rejects with SttUnavailableError when whisper is not configured', async () => {
    delete process.env.WHISPER_BIN; delete process.env.WHISPER_MODEL;
    const { transcribe, SttUnavailableError } = await import('../services/stt-whisper.js?t=1');
    await expect(transcribe({ wav: Buffer.from([0, 1, 2]) })).rejects.toBeInstanceOf(SttUnavailableError);
  });

  // Real transcription only runs when WHISPER_BIN + WHISPER_MODEL are wired up (skipped in CI).
  const ready = process.env.WHISPER_BIN && process.env.WHISPER_MODEL;
  (ready ? it : it.skip)('transcribes a 16kHz WAV fixture into text + segments', async () => {
    process.env.WHISPER_BIN = process.env.WHISPER_BIN!;
    process.env.WHISPER_MODEL = process.env.WHISPER_MODEL!;
    const { transcribe } = await import('../services/stt-whisper.js?t=2');
    const wav = readFileSync(path.join(__dirname, 'fixtures', 'hello-16k.wav'));
    const r = await transcribe({ wav });
    expect(r.text.length).toBeGreaterThan(0);
    expect(Array.isArray(r.segments)).toBe(true);
    expect(['transcription', 'phonetic-guess']).toContain(r.mode);
  });
});
