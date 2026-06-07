import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/services/tts', () => ({ speak: vi.fn().mockResolvedValue(undefined) }));
import { speak } from '@/services/tts';
import { SpeakButton } from './SpeakButton';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('SpeakButton', () => {
  it('calls speak with the text (and phonemes) on click', async () => {
    render(<SpeakButton text="kwet" phonemes="kw E t" />);
    await userEvent.click(screen.getByRole('button'));
    expect(speak).toHaveBeenCalledWith('kwet', { phonemes: 'kw E t' });
  });
});
