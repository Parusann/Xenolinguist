/** Storage/phone limits are separate from Whisper's interactive transcription ceiling. */
export const AUDIO_LIMITS = {
  recordingSeconds: 300,
  transcriptionSeconds: 120,
  sampleRate: 16_000,
  phoneSamples: 4_800_000,
  phoneFrames: 15_000,
  phoneChunks: 43,
  longPhoneDeadlineMs: 600_000,
} as const;
