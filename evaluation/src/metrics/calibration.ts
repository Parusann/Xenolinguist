/** Baseline predictions make no probability claim. Unsupported confidence is never silently charted. */
export function calibration(predictions: { probability?: number; correct: boolean }[], semantics?: string) {
  if (semantics !== 'probability-of-correctness') return { available: false as const, reason: 'No declared probability-of-correctness semantics' };
  if (!predictions.length || predictions.some(p => p.probability === undefined || !Number.isFinite(p.probability) || p.probability < 0 || p.probability > 1))
    throw new Error('Calibration requires finite probabilities for every scored prediction');
  return { available: true as const, brier: predictions.reduce((s, p) => s + (p.probability! - Number(p.correct)) ** 2, 0) / predictions.length,
    bins: Array.from({ length: 10 }, (_, i) => {
      const values = predictions.filter(p => Math.min(9, Math.floor(p.probability! * 10)) === i);
      return { from: i / 10, to: (i + 1) / 10, count: values.length,
        meanProbability: values.length ? values.reduce((s, p) => s + p.probability!, 0) / values.length : null,
        accuracy: values.length ? values.filter(p => p.correct).length / values.length : null };
    }) };
}
