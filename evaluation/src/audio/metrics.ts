/** Versioned English ARPABET comparison; no semantic confidence or pronunciation diagnosis. */
export const AUDIO_PROTOCOL = 'l2-arctic-pilot-v1';
const silence = new Set(['', 'sil', 'sp', 'spn', 'pau', 'epi', 'h#', 'bcl', 'dcl', 'gcl', 'kcl', 'pcl', 'tcl', 'q']);
const folds: Record<string, string> = { ao: 'aa', ax: 'ah', 'ax-h': 'ah', axr: 'er', ix: 'ih', ux: 'uw', el: 'l', em: 'm', en: 'n', nx: 'n', eng: 'ng', hv: 'hh', dx: 't', zh: 'sh' };
const inventory = new Set('aa ae ah aw ay b ch d dh eh er ey f g hh ih iy jh k l m n ng ow oy p r s sh t th uh uw v w y z'.split(' '));
export function phone(label: string): string | null {
  const raw = label.trim().toLowerCase().replace(/[012*]/g, '');
  if (silence.has(raw)) return null;
  const mapped = folds[raw] ?? raw;
  if (raw === 'err') return '<unresolved-reference>';
  if (!inventory.has(mapped)) throw Error('Unsupported phone: ' + label);
  return mapped;
}
export type Span = { label: string; start: number; end: number };
export function perceived(label: string): string | null {
  const parts = label.split(',').map(s => s.trim());
  if (parts.length === 1) return phone(parts[0]);
  if (parts.length !== 3 || !['s', 'a', 'd'].includes(parts[2])) throw Error('Malformed manual phone: ' + label);
  if (parts[2] === 'd' && parts[1].toLowerCase() !== 'sil') throw Error('Malformed deletion');
  return phone(parts[1]);
}
export const words = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
export function editDistance(reference: string[], hypothesis: string[]) {
  if (reference.length > 2000 || hypothesis.length > 2000) throw Error('Scoring sequence exceeds 2000 tokens');
  const width = hypothesis.length + 1, cells = new Uint16Array((reference.length + 1) * width);
  for (let i = 0; i <= reference.length; i++) cells[i * width] = i;
  for (let j = 0; j < width; j++) cells[j] = j;
  for (let i = 1; i <= reference.length; i++) for (let j = 1; j < width; j++) {
    cells[i * width + j] = Math.min(cells[(i - 1) * width + j - 1] + Number(reference[i - 1] !== hypothesis[j - 1]), cells[(i - 1) * width + j] + 1, cells[i * width + j - 1] + 1);
  }
  let i = reference.length, j = hypothesis.length, substitutions = 0, deletions = 0, insertions = 0;
  const matches: [number, number][] = [];
  // Stable tie order: diagonal, deletion, insertion. Timing never influences alignment.
  while (i || j) {
    if (i && j && cells[i * width + j] === cells[(i - 1) * width + j - 1] + Number(reference[i - 1] !== hypothesis[j - 1])) {
      if (reference[i - 1] === hypothesis[j - 1]) matches.push([i - 1, j - 1]); else substitutions++;
      i--; j--;
    } else if (i && cells[i * width + j] === cells[(i - 1) * width + j] + 1) { deletions++; i--; }
    else { insertions++; j--; }
  }
  const errors = substitutions + deletions + insertions;
  return { reference: reference.length, hypothesis: hypothesis.length, substitutions, deletions, insertions, errors,
    rate: reference.length ? errors / reference.length : null, matches: matches.reverse() };
}
export function alignment(reference: Span[], hypothesis: Span[], tolerance = 0.04) {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw Error('Invalid alignment tolerance');
  for (const span of [...reference, ...hypothesis]) if (!Number.isFinite(span.start) || !Number.isFinite(span.end) || span.start < 0 || span.end <= span.start) throw Error('Invalid span');
  const edit = editDistance(reference.map(s => s.label), hypothesis.map(s => s.label));
  const deviations = edit.matches.map(([r, h]) => ({ start: Math.abs(reference[r].start - hypothesis[h].start), end: Math.abs(reference[r].end - hypothesis[h].end) }));
  const within = deviations.filter(d => d.start <= tolerance + 1e-9 && d.end <= tolerance + 1e-9).length;
  return { ...edit, toleranceSeconds: tolerance, matchedPhones: deviations.length, withinTolerance: within,
    matchedBoundaryRate: deviations.length ? within / deviations.length : null,
    referenceBoundaryCoverage: reference.length ? within / reference.length : null, deviations };
}
