/** Uniform version-space heuristic; weights are not calibrated linguistic beliefs. */
export function uniformDisagreement(groupSizes: readonly number[]) {
  if (!groupSizes.length || groupSizes.some(n => !Number.isSafeInteger(n) || n <= 0)) throw Error('Use nonempty positive integer groups.');
  const sizes = [...groupSizes].sort((a, b) => a - b);
  const total = sizes.reduce((sum, n) => sum + n, 0);
  if (!Number.isSafeInteger(total)) throw Error('Candidate count exceeds the exact integer bound.');
  const disagreementBits = sizes.reduce((sum, n) => { const p = n / total; return sum - p * Math.log2(p); }, 0);
  return { disagreementBits, expectedRemaining: sizes.reduce((sum, n) => sum + (n / total) * n, 0) };
}
