import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseProfile } from '../../shared/schemas/profile.js';
import { verifyResearch } from '../../server/src/services/research-integrity.js';
import { hypothesisState } from '../../engine/src/evidence/graph.js';
import { staleReasons } from '../../engine/src/evidence/dependencies.js';
import { evidenceCounts } from '../../engine/src/evidence/scores.js';

const profile = parseProfile(JSON.parse(await readFile(new URL('./w20-research-history.json', import.meta.url), 'utf8')));
verifyResearch(profile);
const r = profile.research, hypothesis = r.hypotheses[0];
assert.equal(r.observations.length, 1);
assert.equal(r.observations[0].text, 'tal');
assert.equal(r.annotations[0].interpretation, 'The speaker was pointing at water');
assert.equal(r.events[0].kind, 'hypothesis-status');
assert.equal(r.events[0].kind === 'hypothesis-status' && r.events[0].status, 'accepted');
assert.equal(hypothesisState(profile, hypothesis).state, 'invalidated');
assert.deepEqual(r.links.map(l => l.relation), ['supports', 'contradicts']);
assert.deepEqual(staleReasons(profile, r.analyses[0]), ['evidence changed']);
assert.equal(r.tests[0].outcome, 'matches');
assert.equal(r.metrics[0].supports, 1);
assert.equal(r.metrics[0].contradicts, 1);
assert.equal(staleReasons(profile, r.metrics[0]).length, 1);
const counts = evidenceCounts(profile, hypothesis.id);
assert.deepEqual(counts, { definition: 'evidence-counts-1', supports: 0, contradicts: 0, ambiguous: 0, staleLinks: 2 });
console.log(JSON.stringify({ passed: true, profileRevision: profile.revision, originalCapture: r.observations[0].text,
  decisionRetained: 'accepted', effectiveHypothesisState: 'invalidated', derivationReplayed: true,
  derivationStaleReasons: staleReasons(profile, r.analyses[0]), historicalSuppliedTarget: r.tests[0].outcome, currentEvidenceCounts: counts }));
