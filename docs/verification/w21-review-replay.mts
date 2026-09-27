import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseProfile } from '../../shared/schemas/profile.js';
import { verifyResearch } from '../../server/src/services/research-integrity.js';
import { verifyProposalReviews, reviewRun } from '../../server/src/services/proposal-review-integrity.js';
import { proposalReviewState } from '../../server/src/services/proposal-reviews.js';

const load = async (name: string) => parseProfile(JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8')));
const original = await load('./w21-review-profile.json'), restored = await load('./w21-review-restored-profile.json');
for (const profile of [original, restored]) { verifyResearch(profile); verifyProposalReviews(profile); }
assert.notEqual(original.id, restored.id);
assert.equal(original.proposal_reviews?.length, 2);
assert.equal(restored.proposal_reviews?.length, 2);
for (let index = 0; index < 2; index++) {
  const before = original.proposal_reviews![index], after = restored.proposal_reviews![index];
  assert.equal(after.source_json, before.source_json); assert.equal(after.run_json, before.run_json);
  assert.equal(after.archived, true); assert.equal(proposalReviewState(restored, after).canAccept, false);
  const action = index === 0 ? 'reject' : 'accept';
  assert.equal(before.decision?.action, action); assert.equal(after.decision?.action, action);
  const run = reviewRun(before)!;
  assert.equal(run.validation.status, index === 0 ? 'falsified' : 'compatible');
  assert.equal(run.validation.checks[0].after.rendered, index === 0 ? 'I will speak' : 'I did speak');
}
const accepted = restored.proposal_reviews![1].decision!;
assert.equal(accepted.hypothesis_id, restored.research.hypotheses[0].id);
assert.notEqual(accepted.hypothesis_id, original.proposal_reviews![1].decision!.hypothesis_id);
const model = JSON.parse(await readFile(new URL('./w21-review-local-model.json', import.meta.url), 'utf8'));
const modelProfile = parseProfile(model.profile); verifyResearch(modelProfile); verifyProposalReviews(modelProfile);
const modelRun = reviewRun(modelProfile.proposal_reviews![0])!;
assert.equal(modelRun.validation.status, 'request'); assert.equal(modelRun.proposal.content.kind, 'observation-request');
assert.equal(modelProfile.proposal_reviews![0].decision?.action, 'accept');
assert.equal(modelProfile.research.hypotheses.length, 0);
assert.equal(model.duplicate_decision_revision_unchanged, true);
console.log(JSON.stringify({ passed: true, profiles: 2, records: 4, decisions: ['reject', 'accept'], exactHistoricalPayloads: true,
  remappedAcceptedHypothesis: true, restoredApplicationBlocked: true, modelResponses: 'deterministic browser fixture',
  additionalRealModelRecord: { validation: modelRun.validation.status, toolsReplayed: modelRun.provenance.tool_calls.length, executableAssertionsAdded: 0 },
  modelGenerationReplayed: false, heldOutEvaluation: false }));
