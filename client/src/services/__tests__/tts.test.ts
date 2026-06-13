import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  const speakSpy = vi.fn();
  vi.stubGlobal('speechSynthesis', { speak: speakSpy, cancel: vi.fn() });
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; rate = 1; constructor(t: string) { this.text = t; } });
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('tts.speak', () => {
  it('falls back to browser speechSynthesis when /api/tts returns 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 } as Response)));
    const mod = await import('../tts.ts?case=1');
    await mod.speak('kwet');
    expect((window.speechSynthesis.speak as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });
});
