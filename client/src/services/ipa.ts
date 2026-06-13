import { blobToWav16k } from '../components/audio/wav-encode';

/** Transcribe an audio Blob to a language-independent phone/IPA string; null when unavailable. */
export async function transcribePhones(blob: Blob): Promise<string | null> {
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
    const data = (await res.json()) as { ipa?: string };
    return data.ipa ?? null;
  } catch {
    return null;
  }
}
