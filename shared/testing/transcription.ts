import type { TranscriptionResult } from '../schemas/transcription.js';

/** Synthetic response for boundary tests; never evidence of native recognition. */
export function transcriptionFixture(sha256: string, sampleCount = 16000): TranscriptionResult {
  return { language: 'en', languageProb: 0.9, text: 'test', segments: [{ start: 0, end: 0.02, text: 'test' }], mode: 'transcription',
    audio: { sha256, sampleCount, sampleRate: 16000, durationSeconds: sampleCount / 16000 },
    provenance: { version: 1, engine: 'whisper.cpp', engineRevision: 'synthetic-test', modelId: 'ggml-base-q5_1',
      modelSha256: 'a'.repeat(64), executableSha256: 'b'.repeat(64), runtimeFiles: [
        { file: 'ggml-base-q5_1.bin', bytes: 1, sha256: 'a'.repeat(64) }, { file: 'whisper-cli.exe', bytes: 1, sha256: 'b'.repeat(64) }],
      node: 'test', platform: 'test', arch: 'test', requestedLanguage: 'auto', threads: 2,
      decoding: 'pinned-cli-defaults', timing: 'model-segments-not-word-alignment', languageSelection: 'detected' } };
}
