import { spawn } from 'child_process';
import path from 'path';
import { espeakPath } from '../config.js';

/** Thrown when espeak-ng is unavailable; the route maps this to HTTP 503. */
export class TtsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TtsUnavailableError';
  }
}

export interface TtsInput {
  text?: string;
  phonemes?: string;
  voice?: string;
}

/** Max wall-clock for a single espeak run before it is killed. Overridable via TTS_TIMEOUT_MS. */
const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS) || 30_000;

/** Render speech to WAV bytes via the bundled espeak-ng. */
export function synthesize(input: TtsInput): Promise<Buffer> {
  const bin = espeakPath();
  if (!bin) {
    return Promise.reject(new TtsUnavailableError('espeak-ng not configured'));
  }

  // espeak reads inline [[...]] Kirshenbaum phonemes; phoneme-exact IPA is a future enhancement.
  const spoken = input.text ?? (input.phonemes ? `[[${input.phonemes}]]` : '');
  const voice = input.voice ?? 'en';
  // `voice` is the `-v` value and `spoken` a trailing positional. Constrain voice to a
  // safe charset and terminate option parsing with `--` so request text/phonemes that
  // start with `-` can't be reinterpreted as espeak flags (e.g. `-w <file>` would make
  // espeak write a WAV to an arbitrary path).
  if (!/^[A-Za-z0-9_+-]{1,20}$/.test(voice)) {
    return Promise.reject(new TtsUnavailableError(`invalid voice: ${voice}`));
  }
  // espeak-ng finds its data via --path (the dir CONTAINING espeak-ng-data), which is
  // bundled next to the binary; this build won't auto-locate it otherwise.
  const args = ['--path', path.dirname(bin), '-v', voice, '--stdout', '--', spoken];

  return new Promise<Buffer>((resolve, reject) => {
    const proc = spawn(bin, args);
    const chunks: Buffer[] = [];
    let err = '';
    let timedOut = false;
    // Kill a hung espeak so a TTS request can't block forever.
    const timer = setTimeout(() => { timedOut = true; proc.kill('SIGKILL'); }, TTS_TIMEOUT_MS);
    proc.stdout.on('data', (d: Buffer) => chunks.push(Buffer.from(d)));
    proc.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
    proc.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new TtsUnavailableError(`espeak-ng spawn error: ${e.code ?? e.message}`));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new TtsUnavailableError('espeak-ng timed out'));
      if (code === 0 && chunks.length > 0) return resolve(Buffer.concat(chunks));
      // Surface espeak's stderr so failures are diagnosable rather than just a bare exit code.
      reject(new TtsUnavailableError(`espeak-ng exited with code ${code}${err ? `: ${err.trim().slice(0, 200)}` : ''}`));
    });
  });
}
