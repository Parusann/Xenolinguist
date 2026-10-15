export const GRADING_VERSION = 1 as const;

/** Exact accepted-form comparison; punctuation inside an answer remains significant. */
export function normalizeAnswer(value: string) {
  return value.normalize('NFKC').toLowerCase().trim().replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '').replace(/\s+/gu, ' ');
}
export function matchAccepted(answer: string, accepted: readonly string[]) {
  const normalized = normalizeAnswer(answer);
  return normalized.length > 0 && accepted.some(form => normalizeAnswer(form) === normalized);
}
export function matchInteger(answer: string, expected: string) {
  const complete = answer.normalize('NFKC').trim();
  if (!/^[+-]?\d+$/.test(complete)) return false;
  const value = Number(complete);
  return Number.isSafeInteger(value) && value === Number(expected);
}
export function sentenceTokens(value: string) { return value.split(/\s+/u).map(normalizeAnswer).filter(Boolean); }
export function submissionKey(value: string, integer: boolean) { return integer ? value.normalize('NFKC').trim() : normalizeAnswer(value); }
