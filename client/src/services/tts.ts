const BASE = '/api';

let currentAudio: HTMLAudioElement | null = null;
// Monotonic token: cancel() bumps it so an in-flight speak() that was superseded won't
// resume playback or trigger a spurious browser fallback when its fetch/play settles.
let speakSeq = 0;

/** Stop any in-progress speech or audio playback. */
export function cancel(): void {
  speakSeq++;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/** Speak via the browser's built-in voice (always-available fallback). */
export function speakBrowser(text: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

/** Speak via the bundled espeak-ng voice; fall back to the browser voice on any failure.
 *  Resolves when playback actually ends, so callers can reflect real playing state. */
export async function speak(
  text: string,
  opts?: { phonemes?: string; voice?: string },
): Promise<void> {
  cancel();
  const seq = speakSeq;
  try {
    const res = await fetch(`${BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, phonemes: opts?.phonemes, voice: opts?.voice }),
    });
    if (seq !== speakSeq) return; // superseded while awaiting
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const blob = await res.blob();
    if (seq !== speakSeq) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    await new Promise<void>((resolve) => {
      const done = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      // A cancel()-induced play() rejection just ends quietly — it must NOT reach the
      // catch below (which would wrongly start the browser fallback).
      Promise.resolve(audio.play()).catch(done);
    });
  } catch {
    if (seq === speakSeq) speakBrowser(text); // only fall back if this call is still current
  }
}
