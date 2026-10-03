import type { CtcAnalysis, IpaResult } from '../../../shared/types.js';

// 120 seconds at 50 frames/second, with a bounded acoustic alphabet.
export const CTC_LIMITS = { frames: 6000, vocabulary: 256, candidates: 3 } as const;

/** Stable softmax summaries over each greedy run; blanks still split repeated phones. */
export function decodeCtcPhones(logits: Float32Array, frames: number, vocab: number, padId: number,
  idToPhone: (id: number) => string, stride = 0.02): IpaResult & { ctc: CtcAnalysis } {
  if (!Number.isInteger(frames) || frames < 1 || frames > CTC_LIMITS.frames || !Number.isInteger(vocab) || vocab < 2 || vocab > CTC_LIMITS.vocabulary
    || !Number.isInteger(padId) || padId < 0 || padId >= vocab || !Number.isFinite(stride) || stride < 0.000001 || stride > 1
    || !(logits instanceof Float32Array) || logits.length !== frames * vocab) throw new Error('Invalid or oversized CTC tensor');
  // Fail the entire decode rather than returning a plausible prefix from corrupt model output.
  for (const value of logits) if (!Number.isFinite(value)) throw new Error('Non-finite CTC logit');
  const labels = Array.from({ length: vocab }, (_, id) => idToPhone(id).trim());
  if (labels.some(label => label.length > 80)) throw new Error('CTC label exceeds limit');
  const special = labels.map(label => !label || /^[<[].*[>\]]$/.test(label));
  const segments: IpaResult['segments'] = [];
  const ctc: CtcAnalysis = { version: 1, decoder: 'greedy', scoreDefinition: 'mean-frame-softmax', timingDefinition: 'frame-bins-not-phonetic-boundaries',
    frames, vocabularySize: vocab, blankId: padId, strideSeconds: stride, blankFrames: 0, specialFrames: 0, runs: [] };
  let previous = -1, start = 0, entropySum = 0;
  const sums = new Float64Array(vocab), probabilities = new Float64Array(vocab);
  const flush = (end: number) => {
    if (previous < 0) return;
    if (previous === padId) ctc.blankFrames += end - start;
    else if (special[previous]) ctc.specialFrames += end - start;
    else {
      const candidates = labels.map((label, id) => ({ tokenId: id, label, blank: id === padId, special: special[id], meanProbability: sums[id] / (end - start) }))
        .sort((a, b) => b.meanProbability - a.meanProbability || a.tokenId - b.tokenId).slice(0, CTC_LIMITS.candidates);
      ctc.runs.push({ segmentIndex: segments.length, tokenId: previous, startFrame: start, endFrameExclusive: end,
        meanEntropyBits: entropySum / (end - start), candidates, omittedProbability: Math.max(0, 1 - candidates.reduce((sum, c) => sum + c.meanProbability, 0)) });
      segments.push({ phone: labels[previous], start: +(start * stride).toFixed(6), end: +(end * stride).toFixed(6) });
    }
  };
  for (let frame = 0; frame < frames; frame++) {
    let winner = 0, max = logits[frame * vocab];
    for (let id = 1; id < vocab; id++) if (logits[frame * vocab + id] > max) { winner = id; max = logits[frame * vocab + id]; }
    if (winner !== previous) { flush(frame); previous = winner; start = frame; sums.fill(0); entropySum = 0; }
    let denominator = 0;
    for (let id = 0; id < vocab; id++) { probabilities[id] = Math.exp(logits[frame * vocab + id] - max); denominator += probabilities[id]; }
    for (let id = 0; id < vocab; id++) {
      const p = probabilities[id] / denominator;
      sums[id] += p;
      if (p > 0) entropySum -= p * Math.log2(p);
    }
  }
  flush(frames);
  return { ipa: segments.map(s => s.phone).join(' '), segments, ctc };
}
