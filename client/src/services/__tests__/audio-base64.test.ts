import { expect, it } from 'vitest';
import { audioBase64 } from '../audio-base64';

it('yields during long audio encoding and preserves bytes across chunk and padding boundaries', async () => {
  for (const length of [0, 49_151, 49_152, 49_153, 98_306]) {
    const input = Uint8Array.from({ length }, (_, i) => i % 256);
    let yielded = false;
    const tick = setTimeout(() => { yielded = true; }, 0);
    const result = await audioBase64(input);
    clearTimeout(tick);
    expect(Uint8Array.from(atob(result), c => c.charCodeAt(0))).toEqual(input);
    if (length > 49_152) expect(yielded).toBe(true);
  }
});
