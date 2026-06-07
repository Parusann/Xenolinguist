import { spawn } from 'child_process';
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

/** Render speech to WAV bytes via the bundled espeak-ng. */
export function synthesize(input: TtsInput): Promise<Buffer> {
  const bin = espeakPath();
  if (!bin) {
    return Promise.reject(new TtsUnavailableError('espeak-ng not configured'));
  }

  // espeak reads inline [[...]] Kirshenbaum phonemes; phoneme-exact IPA is a future enhancement.
  const spoken = input.text ?? (input.phonemes ? `[[${input.phonemes}]]` : '');
  const voice = input.voice ?? 'en';
  const args = ['-v', voice, '--stdout', spoken];

  return new Promise<Buffer>((resolve, reject) => {
    const proc = spawn(bin, args);
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => chunks.push(Buffer.from(d)));
    proc.on('error', (err: NodeJS.ErrnoException) => {
      reject(new TtsUnavailableError(`espeak-ng spawn error: ${err.code ?? err.message}`));
    });
    proc.on('close', (code) => {
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks));
      else reject(new TtsUnavailableError(`espeak-ng exited with code ${code}`));
    });
  });
}
