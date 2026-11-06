import { graphemes } from '../text/spans.js';

export type Alignment = {
  distance: number;
  similarity: number;
  unique: boolean;
  steps: { source: string | null; target: string | null }[];
};
export type ComparisonBudget = { deadline: number; usedCells: number; maxCells: number };
export class ComparisonLimitError extends Error {}

export const orthographicUnits = (form: string) => graphemes(form.trim().normalize('NFC')).map(unit => unit.text);

/** Space-separated segments are supplied explicitly by the user or the reference source. */
export function transcriptionUnits(value?: string | null): string[] | null {
  if (!value?.trim()) return null;
  const text = value.trim().replace(/^\[(.*)\]$/u, '$1').replace(/^\/(.*)\/$/u, '$1');
  const units = text.trim().split(/\s+/u).map(unit => unit.normalize('NFC'));
  return units.some(unit => !unit || unit.includes('/')) ? null : units;
}

/** Unit-cost edit alignment with an explicit count of equally optimal paths, capped at two. */
export function alignUnits(source: string[], target: string[], budget: ComparisonBudget): Alignment {
  if (source.length > 96 || target.length > 96) throw new ComparisonLimitError('Form exceeds the alignment unit bound');
  const width = target.length + 1, cells = (source.length + 1) * width;
  if (performance.now() >= budget.deadline || budget.usedCells + cells > budget.maxCells)
    throw new ComparisonLimitError('Comparison work budget reached');
  budget.usedCells += cells;
  const cost = new Uint16Array(cells), ways = new Uint8Array(cells);
  for (let i = 0; i <= source.length; i++) { cost[i * width] = i; ways[i * width] = 1; }
  for (let j = 0; j <= target.length; j++) { cost[j] = j; ways[j] = 1; }
  for (let i = 1; i <= source.length; i++) {
    for (let j = 1; j <= target.length; j++) {
      const here = i * width + j, diagonal = here - width - 1;
      const substitution = cost[diagonal] + Number(source[i - 1] !== target[j - 1]);
      const deletion = cost[here - width] + 1, insertion = cost[here - 1] + 1;
      const best = Math.min(substitution, deletion, insertion);
      cost[here] = best;
      ways[here] = Math.min(2, (substitution === best ? ways[diagonal] : 0) +
        (deletion === best ? ways[here - width] : 0) + (insertion === best ? ways[here - 1] : 0));
    }
  }
  const steps: Alignment['steps'] = [];
  let i = source.length, j = target.length;
  while (i || j) {
    const here = i * width + j;
    if (i && j && cost[here] === cost[here - width - 1] + Number(source[i - 1] !== target[j - 1])) {
      steps.push({ source: source[--i], target: target[--j] });
    } else if (i && cost[here] === cost[here - width] + 1) {
      steps.push({ source: source[--i], target: null });
    } else {
      steps.push({ source: null, target: target[--j] });
    }
  }
  const distance = cost[cells - 1];
  return { distance, similarity: 1 - distance / Math.max(source.length, target.length, 1),
    unique: ways[cells - 1] === 1, steps: steps.reverse() };
}
