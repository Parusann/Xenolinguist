import { useState } from 'react';
import { speak } from '@/services/tts';

interface SpeakButtonProps {
  text: string;
  phonemes?: string;
  title?: string;
  className?: string;
}

export function SpeakButton({ text, phonemes, title = 'Hear it', className = '' }: SpeakButtonProps) {
  const [playing, setPlaying] = useState(false);

  const handleClick = async () => {
    setPlaying(true);
    try {
      await speak(text, { phonemes });
    } finally {
      setPlaying(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-label={title}
      disabled={!text}
      className={`tts-btn ${className}`}
    >
      {playing ? '◼' : '🔊'}
    </button>
  );
}
