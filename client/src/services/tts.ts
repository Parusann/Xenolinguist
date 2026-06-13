const BASE = '/api';

let currentAudio: HTMLAudioElement | null = null;

/** Stop any in-progress speech or audio playback. */
export function cancel(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/** Speak via the browser's built-in voice (always-available fallback). */
export function speakBrowser(text: string, opts?: { rate?: number }): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (opts?.rate) u.rate = opts.rate;
  window.speechSynthesis.speak(u);
}

/** Speak via the bundled espeak-ng voice; fall back to the browser voice on any failure. */
export async function speak(
  text: string,
  opts?: { phonemes?: string; voice?: string; rate?: number },
): Promise<void> {
  cancel();
  try {
    const res = await fetch(`${BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, phonemes: opts?.phonemes, voice: opts?.voice }),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };
    await audio.play();
  } catch {
    speakBrowser(text, { rate: opts?.rate });
  }
}
