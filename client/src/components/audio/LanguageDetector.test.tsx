import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LanguageBadge } from './LanguageDetector';

describe('LanguageBadge', () => {
  it('shows a transcription tag for confident results', () => {
    render(<LanguageBadge detecting={false} result={{ language: 'English', confidence: 0.9, transcript: 'hello', mode: 'transcription', segments: [] }} />);
    expect(screen.getByText(/English/i)).toBeTruthy();
    expect(screen.getByText(/transcription/i)).toBeTruthy();
  });

  it('shows a low-confidence phonetic-guess tag', () => {
    render(<LanguageBadge detecting={false} result={{ language: 'English', confidence: 0.3, transcript: 'xq tlik', mode: 'phonetic-guess', segments: [] }} />);
    expect(screen.getByText(/phonetic guess/i)).toBeTruthy();
  });
});
