import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const transcriptionResultSchema = z.strictObject({
  language: z.string().regex(/^[a-z]{2,3}$/),
  languageProb: z.number().finite().min(0).max(1).nullable(),
  text: z.string().max(200_000),
  segments: z.array(z.strictObject({ start: z.number().finite().nonnegative().max(120),
    end: z.number().finite().positive().max(120), text: z.string().min(1).max(20_000) })).max(6000),
  mode: z.enum(['transcription', 'phonetic-guess']),
  audio: z.strictObject({ sha256: hash, sampleRate: z.literal(16000),
    sampleCount: z.number().int().min(400).max(1_920_000), durationSeconds: z.number().min(0.025).max(120) }),
  provenance: z.strictObject({ version: z.literal(1), engine: z.literal('whisper.cpp'),
    engineRevision: z.string().min(1).max(64), modelId: z.literal('ggml-base-q5_1'),
    modelSha256: hash, executableSha256: hash,
    runtimeFiles: z.array(z.strictObject({ file: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
      bytes: z.number().int().positive(), sha256: hash })).min(1).max(16),
    node: z.string().min(1).max(64), platform: z.string().min(1).max(32), arch: z.string().min(1).max(32),
    requestedLanguage: z.string().regex(/^(auto|[a-z]{2})$/), threads: z.literal(2),
    decoding: z.literal('pinned-cli-defaults'), timing: z.literal('model-segments-not-word-alignment'),
    languageSelection: z.enum(['explicit', 'detected', 'unreported']),
  }),
}).superRefine((r, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (r.audio.durationSeconds !== r.audio.sampleCount / 16000) fail('Invalid transcription audio geometry');
  if (r.text !== r.segments.map(s => s.text).join(' ').trim()) fail('Transcript text differs from segments');
  let previous = 0;
  for (const s of r.segments) {
    if (s.text !== s.text.trim() || s.start < previous || s.end <= s.start || s.end > r.audio.durationSeconds)
      fail('Invalid transcription segment');
    previous = s.end;
  }
  const p = r.provenance, explicit = p.requestedLanguage !== 'auto';
  if (p.languageSelection !== (explicit ? 'explicit' : r.languageProb === null ? 'unreported' : 'detected')
    || (explicit && (r.languageProb !== null || r.language !== p.requestedLanguage))) fail('Invalid language-selection metadata');
  const mode = r.text && r.segments.length && (explicit || (r.languageProb !== null && r.languageProb >= 0.6)) ? 'transcription' : 'phonetic-guess';
  if (r.mode !== mode) fail('Invalid legacy transcription mode');
  if (new Set(p.runtimeFiles.map(f => f.file)).size !== p.runtimeFiles.length
    || !p.runtimeFiles.some(f => f.file === 'ggml-base-q5_1.bin' && f.sha256 === p.modelSha256)
    || !p.runtimeFiles.some(f => f.file === 'whisper-cli.exe' && f.sha256 === p.executableSha256)) fail('Missing or inconsistent runtime identity');
});
export type TranscriptionResult = z.infer<typeof transcriptionResultSchema>;
