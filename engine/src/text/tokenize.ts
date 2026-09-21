import type { LexicalPolicy } from '../../../shared/types.js';
import { DEFAULT_LEXICAL_POLICY } from './normalize.js';
import { graphemes, sourceSpan, type SourceSpan } from './spans.js';

export interface TextToken extends SourceSpan { kind: 'word' | 'space' | 'punctuation' }
const word = /[\p{L}\p{M}\p{N}]/u;
const apostrophe = /^['’ʼ]$/u;
const hyphen = /^[-‐‑]$/u;

/** Whitespace boundaries by default; this does not infer words in unspaced scripts. */
export function tokenize(source: string, policy: LexicalPolicy = DEFAULT_LEXICAL_POLICY): TextToken[] {
  const units = graphemes(source);
  const tokens: TextToken[] = [];
  units.forEach((unit, i) => {
    const isJoiner = apostrophe.test(unit.text) || hyphen.test(unit.text);
    const internal = (apostrophe.test(unit.text) ? policy.apostrophes : policy.hyphens) === 'internal';
    const lexical = isJoiner
      ? internal && i > 0 && i + 1 < units.length && word.test(units[i - 1].text) && word.test(units[i + 1].text)
      : word.test(unit.text);
    const kind = /^\s+$/u.test(unit.text) ? 'space' : lexical ? 'word' : 'punctuation';
    const previous = tokens.at(-1);
    if (previous?.kind === kind && kind !== 'punctuation') {
      previous.end = unit.end;
      previous.text = source.slice(previous.start, previous.end);
    } else tokens.push({ ...unit, kind });
  });
  return tokens;
}

/** Optional dictionary segmentation permits boundaries at graphemes within word runs. */
export function lookupUnits(source: string, policy: LexicalPolicy): TextToken[] {
  return tokenize(source, policy).flatMap(token => policy.segmentation === 'dictionary' && token.kind === 'word'
    ? graphemes(token.text).map(part => ({ ...sourceSpan(source, token.start + part.start, token.start + part.end), kind: token.kind }))
    : [token]);
}
