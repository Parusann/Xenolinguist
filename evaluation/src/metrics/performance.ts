export function performanceSummary(values: number[]) {
  if (!values.length) return { count: 0, medianMs: null, p95Ms: null, minMs: null, maxMs: null };
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => ordered[Math.max(0, Math.ceil(p * ordered.length) - 1)];
  return { count: values.length, medianMs: percentile(0.5), p95Ms: percentile(0.95), minMs: ordered[0], maxMs: ordered.at(-1)! };
}
