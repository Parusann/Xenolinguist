import { normalizeContent } from './workspace-metrics.js';
export const BASE_CANDIDATES = [5, 6, 7, 8, 10, 12, 16, 20];
const tokensOf = (word: string): string[] => normalizeContent(word).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
/** Exploratory token reuse in (B, 2B]. Requires both reference forms and a
 * distinct compound, so repeated labels or missing references cannot add support.
 * Distinct comparisons are not proven independent linguistic observations. */
export function scoreBase(mappings: Record<string, string>, base: number) {
  let checked = 0, support = 0;
  const seen = new Set<string>();
  const seenUnits = new Set<string>();
  for (let n = base + 1; n <= 2 * base; n++) {
    const compound = normalizeContent(mappings[n] ?? '');
    const root = normalizeContent(mappings[base] ?? '');
    const unit = normalizeContent(mappings[n - base] ?? '');
    const tokens = tokensOf(compound), roots = tokensOf(root), units = tokensOf(unit);
    if (!tokens.length || !roots.length || !units.length || compound === root || compound === unit || root === unit || seen.has(compound) || seenUnits.has(unit)) continue;
    seen.add(compound); seenUnits.add(unit); checked++;
    if (roots.some(token => tokens.includes(token)) && units.some(token => tokens.includes(token))) support++;
  }
  return { base, support, checked, possible: base, ratio: checked ? support / checked : null };
}
export function rankBases(mappings: Record<string, string>) {
  const scores = BASE_CANDIDATES.map(base => scoreBase(mappings, base));
  const eligible = scores.filter(score => score.support >= 2);
  const max = Math.max(...eligible.map(score => score.ratio ?? 0), 0);
  const leaders = eligible.filter(score => score.ratio === max);
  return { scores, leaders, suggestedBase: leaders.length === 1 ? leaders[0].base : null };
}
