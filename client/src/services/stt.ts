import { blobToWav16k } from '../components/audio/wav-encode';
import type { SttResult } from 'shared/types';
import { transcriptionResultSchema } from 'shared/schemas/transcription';

/** Transcribe an audio Blob via the local whisper sidecar; null when unavailable. */
export async function transcribe(blob: Blob, opts?: { language?: string; preparedWav?: boolean }): Promise<SttResult | null> {
  try {
    const wav = opts?.preparedWav ? blob : await blobToWav16k(blob);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const base64 = btoa(bytes.reduce((data, byte) => data + String.fromCharCode(byte), ''));
    const res = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64, language: opts?.language }),
    });
    if (!res.ok) return null;
    const result = transcriptionResultSchema.parse(await res.json());
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (result.audio.sha256 !== hash || result.provenance.requestedLanguage !== (opts?.language ?? 'auto')) return null;
    return result;
  } catch {
    return null;
  }
}
