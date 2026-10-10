import { AUDIO_LIMITS } from '../../../shared/audio-limits.js';
/** Energy-only boundary hints, not a learned speech detector. No frames are removed. */
export function quietPhoneFrames(audio: Float32Array): boolean[] {
  if (audio.length < 400 || audio.length > AUDIO_LIMITS.phoneSamples) throw Error('Audio sample limit exceeded');
  for (const sample of audio) if (!Number.isFinite(sample) || Math.abs(sample) > 1) throw Error('Invalid normalized audio');
  const frames = Math.floor((audio.length - 400) / 320) + 1;
  return Array.from({ length: frames }, (_, frame) => {
    let squares = 0;
    for (let i = frame * 320; i < frame * 320 + 400; i++) squares += audio[i] * audio[i];
    return squares / 400 <= 0.01 ** 2;
  });
}
