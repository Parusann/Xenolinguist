import { blobToWav16k } from '../components/audio/wav-encode';
import type { SttResult } from 'shared/types';

/** Transcribe an audio Blob via the local whisper sidecar; null when unavailable. */
export async function transcribe(blob: Blob, opts?: { language?: string }): Promise<SttResult | null> {
  try {
    const wav = await blobToWav16k(blob);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const base64 = btoa(bytes.reduce((data, byte) => data + String.fromCharCode(byte), ''));
    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64, language: opts?.language }),
    });
    if (!res.ok) return null;
    return (await res.json()) as SttResult;
  } catch {
    return null;
  }
}
