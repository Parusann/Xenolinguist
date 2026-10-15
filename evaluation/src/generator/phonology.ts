export const PHONEMES = ['p', 't', 'k', 'm', 'n', 's', 'l', 'r', 'a', 'e', 'i', 'o', 'u'] as const;
/** A finite pronounceable CVCV inventory, in explicitly fixed iteration order. */
export function forms() {
  const words: string[] = [];
  for (const c of PHONEMES.slice(0, 8)) for (const v of PHONEMES.slice(8))
    for (const c2 of PHONEMES.slice(0, 8)) for (const v2 of PHONEMES.slice(8)) words.push(c + v + c2 + v2);
  return words;
}
