import { blobToWav16k } from '../components/audio/wav-encode';
import type { IpaResult } from 'shared/types';

/** Transcribe an audio Blob to phones + per-phone timings; null when unavailable. */
export async function transcribePhones(blob: Blob): Promise<IpaResult | null> {
  try {
    const wav = await blobToWav16k(blob);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const base64 = btoa(bytes.reduce((data, byte) => data + String.fromCharCode(byte), ''));
    const res = await fetch('/api/ipa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64 }),
    });
    if (!res.ok) return null;
    return (await res.json()) as IpaResult;
  } catch {
    return null;
  }
}
