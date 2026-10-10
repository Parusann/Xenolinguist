import { AUDIO_LIMITS } from '../audio-limits.js';
import { z } from 'zod';
import { entityIdSchema, timestampSchema } from './common.js';

export const PHONE_HISTORY_LIMIT = 8;
export const PHONE_HISTORY_BYTES = 4 * 1024 * 1024;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(AUDIO_LIMITS.phoneFrames);
const token = z.number().int().nonnegative().max(255);
const probability = z.number().finite().min(0).max(1);
const label = z.string().min(1).max(128);
const segment = z.strictObject({ phone: label, start: z.number().finite().nonnegative().max(AUDIO_LIMITS.recordingSeconds), end: z.number().finite().positive().max(AUDIO_LIMITS.recordingSeconds) });
export const retainedPhoneResultSchema = z.strictObject({
  ipa: z.string().max(800_000), segments: z.array(segment).max(AUDIO_LIMITS.phoneFrames),
  identity: z.strictObject({ modelId: z.string().min(1).max(256), modelSha256: hash, alphabet: z.literal('TIMIT ARPABET'),
    transformers: z.string().min(1).max(64), backend: z.string().min(1).max(64), node: z.string().min(1).max(64) }),
  audio: z.strictObject({ sha256: hash, sampleRate: z.literal(16000), sampleCount: z.number().int().min(400).max(AUDIO_LIMITS.phoneSamples),
    durationSeconds: z.number().finite().min(0.025).max(AUDIO_LIMITS.recordingSeconds) }),
  ctc: z.strictObject({ version: z.literal(1), decoder: z.literal('greedy'), scoreDefinition: z.literal('mean-frame-softmax'),
    timingDefinition: z.literal('frame-bins-not-phonetic-boundaries'), frames: count.min(1), vocabularySize: z.number().int().min(2).max(256),
    blankId: token, strideSeconds: z.literal(0.02), blankFrames: count, specialFrames: count,
    runs: z.array(z.strictObject({ segmentIndex: count, tokenId: token, startFrame: count, endFrameExclusive: count,
      meanEntropyBits: z.number().finite().min(0).max(8), omittedProbability: probability,
      candidates: z.array(z.strictObject({ tokenId: token, label: z.string().max(128), blank: z.boolean(), special: z.boolean(), meanProbability: probability })).min(2).max(3),
    })).max(AUDIO_LIMITS.phoneFrames) }),
  processing: z.strictObject({ version: z.literal(1), strategy: z.literal('overlap-frame-ownership'), coreFrames: z.literal(400),
    contextFrames: z.literal(25), quietRms: z.literal(0.01), quietFrameCount: count,
    chunks: z.array(z.strictObject({ index: z.number().int().min(0).max(AUDIO_LIMITS.phoneChunks - 1), startSample: z.number().int().nonnegative().max(AUDIO_LIMITS.phoneSamples),
      endSample: z.number().int().positive().max(AUDIO_LIMITS.phoneSamples), startFrame: count, endFrameExclusive: count,
      keepStartFrame: count, keepEndFrameExclusive: count, boundary: z.enum(['low-energy', 'limit', 'end']) })).min(1).max(AUDIO_LIMITS.phoneChunks),
  }),
}).superRefine((r, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const { ctc: c, audio: a, processing: p } = r;
  if (c.frames !== Math.floor((a.sampleCount - 400) / 320) + 1 || a.durationSeconds !== a.sampleCount / 16000
    || c.blankId >= c.vocabularySize || p.quietFrameCount > c.frames) fail('Invalid acoustic geometry');
  if (r.ipa !== r.segments.map(s => s.phone).join(' ') || c.runs.length !== r.segments.length) fail('Phone text or run links differ');
  let accounted = c.blankFrames + c.specialFrames, previous = 0;
  c.runs.forEach((run, i) => {
    const s = r.segments[i];
    if (!s || run.segmentIndex !== i || run.tokenId >= c.vocabularySize || run.tokenId === c.blankId
      || run.startFrame < previous || run.endFrameExclusive <= run.startFrame || run.endFrameExclusive > c.frames
      || s.start !== +(run.startFrame * c.strideSeconds).toFixed(6) || s.end !== +(run.endFrameExclusive * c.strideSeconds).toFixed(6))
      fail('Invalid phone run timing or identity');
    accounted += run.endFrameExclusive - run.startFrame; previous = run.endFrameExclusive;
    const ids = new Set(run.candidates.map(candidate => candidate.tokenId));
    if (ids.size !== run.candidates.length || run.candidates.length !== Math.min(3, c.vocabularySize)
      || run.candidates[0].tokenId !== run.tokenId || run.candidates[0].special
      || Math.abs(run.candidates.reduce((sum, candidate) => sum + candidate.meanProbability, run.omittedProbability) - 1) > 1e-6
      || run.meanEntropyBits > Math.log2(c.vocabularySize) + 1e-6) fail('Invalid acoustic score accounting');
    run.candidates.forEach((candidate, index) => {
      if (candidate.tokenId >= c.vocabularySize || candidate.blank !== (candidate.tokenId === c.blankId)
        || (candidate.tokenId === run.tokenId && candidate.label !== s?.phone)
        || (index > 0 && candidate.meanProbability > run.candidates[index - 1].meanProbability)) fail('Invalid acoustic candidate');
    });
  });
  if (accounted !== c.frames) fail('Acoustic frames are not fully accounted for');
  let owned = 0;
  p.chunks.forEach((chunk, i) => {
    const end = chunk.keepEndFrameExclusive;
    if (chunk.index !== i || chunk.keepStartFrame !== owned || end <= owned || end - owned > 400 || end > c.frames
      || (end < c.frames && end - owned < 350) || (chunk.boundary === 'limit' && end - owned !== 400)
      || chunk.startFrame !== Math.max(0, owned - 25) || chunk.endFrameExclusive !== Math.min(c.frames, end + 25)
      || chunk.startSample !== chunk.startFrame * 320
      || chunk.endSample !== (chunk.endFrameExclusive === c.frames ? a.sampleCount : chunk.endFrameExclusive * 320 + 80)
      || chunk.endSample - chunk.startSample > 144399 || (end === c.frames) !== (chunk.boundary === 'end')) fail('Invalid window ownership');
    owned = end;
  });
  if (owned !== c.frames) fail('Window ownership is incomplete');
});
export const phoneAnalysisSchema = z.strictObject({ version: z.literal(1), id: entityIdSchema,
  created_at: timestampSchema, originalSha256: hash, result: retainedPhoneResultSchema });
export const phoneHistorySchema = z.array(phoneAnalysisSchema).max(PHONE_HISTORY_LIMIT).superRefine((history, ctx) => {
  if (new Set(history.map(a => a.id)).size !== history.length) ctx.addIssue({ code: 'custom', message: 'Duplicate phone analysis identifier' });
  if (new TextEncoder().encode(JSON.stringify(history)).length > PHONE_HISTORY_BYTES)
    ctx.addIssue({ code: 'custom', message: 'Phone history exceeds 4 MiB; existing analyses are retained' });
});
export type PhoneAnalysis = z.infer<typeof phoneAnalysisSchema>;
