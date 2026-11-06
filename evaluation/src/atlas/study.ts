import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { compareLanguages } from '../../../engine/src/comparison/compare.js';
import { syntheticComparison } from './fixtures.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const runs: { seed: number; anchors: number; inputSha256: string; top: string; support: number; state: string;
  audit: { scheduled: number; emitted: number; correct: number; precision: number | null };
  proposals: number; correct: number; unrelatedProposals: number; durationMs: number; cells: number }[] = [];
const examples = [];
const started = performance.now();
for (let seed = 1; seed <= 32; seed++) for (const anchors of [2, 6, 12, 24]) {
  const { input, reference, unrelated, transform } = syntheticComparison(seed, anchors);
  const normal = compareLanguages(input, [reference, unrelated]);
  const borrowed = structuredClone(unrelated);
  borrowed.entries[0].form = input.entries[0].form;
  const control = compareLanguages(input, [borrowed]);
  const match = normal.matches.find(row => row.languageId === 'related')!;
  let proposals = 0, correct = 0;
  for (const proposal of match.proposals) {
    proposals++;
    const entry = reference.entries.find(entry => entry.id === proposal.referenceIds[0])!;
    if (proposal.forms.length === 1 && proposal.forms[0] === transform(entry.form)) correct++;
  }
  assert.equal(control.matches[0].proposals.length, 0, 'Unrelated borrowing control must not propose a form');
  assert.equal(correct, proposals, 'Every emitted synthetic prediction must match hidden ground truth');
  runs.push({ seed, anchors, inputSha256: hash({ input, references: [reference, unrelated] }),
    top: normal.matches[0].languageId, support: match.systematicSupport, state: normal.state,
    audit: match.predictionAudit, proposals, correct, unrelatedProposals: control.matches[0].proposals.length,
    durationMs: normal.resources.durationMs, cells: normal.resources.alignmentCells });
  if (seed === 17 && [2, 24].includes(anchors)) examples.push({ input, references: [reference, unrelated], report: normal });
}
const groups = [2, 6, 12, 24].map(anchors => {
  const subset = runs.filter(run => run.anchors === anchors), durations = subset.map(run => run.durationMs).sort((a, b) => a - b);
  return { anchors, cases: subset.length, topOne: subset.filter(run => run.top === 'related').length,
    insufficient: subset.filter(run => run.state === 'insufficient').length,
    proposals: subset.reduce((n, run) => n + run.proposals, 0), correct: subset.reduce((n, run) => n + run.correct, 0),
    auditEmitted: subset.reduce((n, run) => n + run.audit.emitted, 0), auditCorrect: subset.reduce((n, run) => n + run.audit.correct, 0),
    p95Ms: durations[Math.ceil(durations.length * 0.95) - 1] };
});
const report = { version: 'atlas-comparison-study-1', checkedAt: new Date().toISOString(), method: 'bounded-correspondences-1',
  design: '32 seeded, synthetic lineages; equal-length five-unit words; disjoint scripts; one regular-substitution candidate and one random control. Additional unrelated control borrows one exact word. Development validation, not a natural-language ancestry benchmark.',
  groups, runs, examples, elapsedMs: performance.now() - started, maximumRssKiB: process.resourceUsage().maxRSS,
  limits: ['No claim of general historical reconstruction, probabilistic ancestry, or natural-language prediction accuracy.',
    'The position-independent substitution model cannot represent conditioned sound changes or richer morphology.'] };
const output = process.argv[2];
if (!output) throw new Error('Provide an output JSON path');
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ groups, elapsedMs: report.elapsedMs, maximumRssKiB: report.maximumRssKiB }, null, 2));
