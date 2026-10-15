import { expect, it } from 'vitest';
import { transcriptionResultSchema } from '../../../shared/schemas/transcription.js';
import { transcriptionFixture } from '../../../shared/testing/transcription.js';
import { parseLanguageProb, computeMode } from '../services/stt-whisper.js';

it('distinguishes a measured zero from absent or malformed language scores', () => {
  expect(parseLanguageProb('auto-detected language: en (p = 0.876527)')).toBe(0.876527);
  expect(parseLanguageProb('auto-detected language: en (p = 0)')).toBe(0);
  for (const text of ['', 'auto-detected language: en (p = )', 'auto-detected language: en (p = NaN)',
    'auto-detected language: en (p = 1.1)', 'auto-detected language: en (p = -0.1)']) expect(parseLanguageProb(text)).toBeNull();
});

it('retains explicit selection without inventing a detection probability', () => {
  const r = transcriptionFixture('c'.repeat(64));
  r.languageProb = null; r.provenance.requestedLanguage = 'en'; r.provenance.languageSelection = 'explicit';
  expect(transcriptionResultSchema.parse(r)).toEqual(r);
  expect(computeMode({ languageProb: null, segments: r.segments, explicitLanguage: true })).toBe('transcription');
  expect(transcriptionResultSchema.safeParse({ ...r, languageProb: 1 }).success).toBe(false);
});

it('rejects transcript geometry, text and runtime identities that disagree', () => {
  const r = transcriptionFixture('c'.repeat(64));
  const invalid = [{ ...r, text: 'different' }, { ...r, audio: { ...r.audio, durationSeconds: 2 } },
    { ...r, segments: [{ start: 0, end: 2, text: 'test' }] },
    { ...r, segments: [{ start: 0.5, end: 0.1, text: 'test' }] },
    { ...r, provenance: { ...r.provenance, runtimeFiles: [] } },
    { ...r, provenance: { ...r.provenance, modelSha256: 'd'.repeat(64) } },
    { ...r, provenance: { ...r.provenance, runtimeFiles: [...r.provenance.runtimeFiles, r.provenance.runtimeFiles[0]] } }];
  for (const value of invalid) expect(transcriptionResultSchema.safeParse(value).success).toBe(false);
});

it('retains empty output and absent detection as uncertainty without fake text', () => {
  const r = transcriptionFixture('c'.repeat(64));
  r.text = ''; r.segments = []; r.languageProb = null; r.mode = 'phonetic-guess'; r.provenance.languageSelection = 'unreported';
  expect(transcriptionResultSchema.parse(r)).toEqual(r);
});
