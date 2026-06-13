import { describe, it, expect } from 'vitest';
import { formatSamplesForPrompt, SYSTEM_PROMPTS } from '../../../shared/prompts.js';

describe('formatSamplesForPrompt with IPA', () => {
  it('includes the IPA when present', () => {
    const out = formatSamplesForPrompt([{ alien_text: 'nesh', english_translation: 'star', ipa: 'n ɛ ʃ' }]);
    expect(out).toContain('n ɛ ʃ');
  });
  it('omits IPA when absent', () => {
    const out = formatSamplesForPrompt([{ alien_text: 'nesh', english_translation: null }]);
    expect(out).not.toContain('[ipa');
  });
});

describe('phoneticAnalysis prompt', () => {
  it('exists', () => { expect(SYSTEM_PROMPTS.phoneticAnalysis).toBeTruthy(); });
});
