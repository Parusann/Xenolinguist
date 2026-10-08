import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'child_process';
import { verifyWhisperAssets } from '../services/whisper-assets.js';
import { transcribe, SttUnavailableError } from '../services/stt-whisper.js';
import { transcriptionFixture } from '../../../shared/testing/transcription.js';

vi.mock('child_process', () => ({ spawn: vi.fn() }));
vi.mock('../services/whisper-assets.js', () => ({ verifyWhisperAssets: vi.fn() }));
let wav: Buffer, inputPath: string, cliArgs: string[];
let output: unknown;
beforeEach(async () => {
  vi.stubEnv('WHISPER_BIN', 'fixture/whisper-cli.exe'); vi.stubEnv('WHISPER_MODEL', 'fixture/model.bin');
  wav = await readFile(new URL('./fixtures/hello-16k.wav', import.meta.url));
  output = { result: { language: 'en' }, transcription: [{ offsets: { from: 0, to: 1200 }, text: ' hello ' }] };
  const p = transcriptionFixture('c'.repeat(64)).provenance;
  vi.mocked(verifyWhisperAssets).mockResolvedValue({ engineRevision: p.engineRevision, modelId: p.modelId,
    modelSha256: p.modelSha256, executableSha256: p.executableSha256, runtimeFiles: p.runtimeFiles });
  vi.mocked(spawn).mockImplementation((_bin, args) => {
    cliArgs = args as string[]; inputPath = cliArgs[cliArgs.indexOf('-f') + 1];
    const base = cliArgs[cliArgs.indexOf('-of') + 1];
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(),
      kill: vi.fn(() => { queueMicrotask(() => child.emit('close', null)); return true; }) });
    void writeFile(base + '.json', JSON.stringify(output)).then(() => {
      child.stderr.write('auto-detected language: en (p = 0.88)'); child.emit('close', 0);
    });
    return child as unknown as ReturnType<typeof spawn>;
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it('binds native output to exact submitted audio and verified runtime and cleans temporary files', async () => {
  const r = await transcribe({ wav });
  expect(r.audio).toEqual({ sha256: createHash('sha256').update(wav).digest('hex'), sampleRate: 16000, sampleCount: 55121, durationSeconds: 55121 / 16000 });
  expect(r.provenance.languageSelection).toBe('detected'); expect(r.languageProb).toBe(0.88);
  expect(cliArgs.slice(-4)).toEqual(['-l', 'auto', '-t', '2']);
  expect(r.provenance.runtimeFiles).toHaveLength(2);
  await expect(access(inputPath)).rejects.toThrow();
});
it('never reports explicit selection as measured confidence', async () => {
  const r = await transcribe({ wav, language: 'en' });
  expect(r.languageProb).toBeNull(); expect(r.provenance.languageSelection).toBe('explicit');
  expect(cliArgs.slice(-4)).toEqual(['-l', 'en', '-t', '2']);
});
it('rejects malformed native output and removes temporary audio', async () => {
  output = { result: { language: 'en' }, transcription: [{ text: 'no timestamps' }] };
  await expect(transcribe({ wav })).rejects.toThrow();
  await expect(access(inputPath)).rejects.toThrow();
});
it('does not spawn a process when assets fail verification or the request is already cancelled', async () => {
  vi.mocked(verifyWhisperAssets).mockRejectedValue(new Error('hash mismatch'));
  await expect(transcribe({ wav })).rejects.toBeInstanceOf(SttUnavailableError);
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await expect(transcribe({ wav, signal: controller.signal })).rejects.toThrow('cancelled');
  expect(spawn).not.toHaveBeenCalled();
});
