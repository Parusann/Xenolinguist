import { blobToWav16k } from '../components/audio/wav-encode';
import type { IpaResult } from 'shared/types';

/** Transcribe an audio Blob to phones + per-phone timings; null when unavailable. */
export async function transcribePhones(blob: Blob, onUnavailable?: (message: string) => void): Promise<IpaResult | null> {
  try {
    const wav = await blobToWav16k(blob);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const base64 = btoa(bytes.reduce((data, byte) => data + String.fromCharCode(byte), ''));
    const res = await fetch('/api/ipa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64 }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const messages: Record<string, string> = {
        IPA_MODEL_MISSING: 'Phone model is missing. Restore the bundled model files and try again.',
        IPA_MODEL_INVALID: 'Phone model files failed verification. Restore the bundled model files.',
        IPA_PACKAGE_MISSING: 'The phone runtime is incomplete. Reinstall the application.',
        IPA_NATIVE_LOAD_FAILED: 'The native phone runtime could not start. Restart or reinstall the application.',
        IPA_UNSUPPORTED_INPUT: 'Phone analysis requires mono 16 kHz PCM audio between 25 ms and 120 seconds.',
      };
      onUnavailable?.(messages[error.code] ?? 'Phone analysis failed. Your recording is still available; try again.');
      return null;
    }
    return (await res.json()) as IpaResult;
  } catch {
    onUnavailable?.('Phone analysis could not connect or decode the recording. Your recording is still available.');
    return null;
  }
}
