import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseProfile } from '../../shared/schemas/profile.js';
import { verifyResearch } from '../../server/src/services/research-integrity.js';
import { verifyElicitation, elicitationReport, elicitationState } from '../../server/src/services/elicitation-integrity.js';

const load = async (name: string) => parseProfile(JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8')));
const original = await load('./w22-number-elicitation-profile.json');
const restored = await load('./w22-number-elicitation-restored-profile.json');
for (const profile of [original, restored]) { verifyResearch(profile); verifyElicitation(profile); }
assert.notEqual(original.id, restored.id);
assert.equal(original.elicitation_history?.length, 2);
assert.equal(restored.elicitation_history?.length, 2);
for (let index = 0; index < 2; index++) {
  const before = original.elicitation_history![index], after = restored.elicitation_history![index];
  assert.equal(after.id, before.id);
  for (const key of ['source_json', 'source_sha256', 'input_sha256', 'report_json', 'report_sha256'] as const) assert.equal(after[key], before[key]);
  assert.equal(after.archived, true);
  assert.equal(elicitationState(restored, after).canDecide, false);
  const action = index === 0 ? 'decline' : 'answer';
  assert.equal(before.decision?.action, action); assert.equal(after.decision?.action, action);
  for (const key of ['action', 'answer', 'reason', 'mutation_id', 'digest', 'created_at', 'applied_revision', 'after_json', 'after_sha256'] as const) {
    assert.equal(after.decision![key], before.decision![key]);
  }
}
const declined = original.elicitation_history![0], answered = original.elicitation_history![1];
assert.equal(declined.decision!.observation_id, null);
assert.equal(declined.decision!.after_json, null);
const before = elicitationReport(answered), after = JSON.parse(answered.decision!.after_json!);
assert.notEqual(before.selection!.value, elicitationReport(declined).selection!.value);
assert.equal(original.number_system.mappings[String(before.selection!.value)], answered.decision!.answer);
assert.ok(original.number_system.validation_values?.includes(before.selection!.value));
assert.equal(original.research.observations.length, 1);
assert.equal(restored.research.observations.length, 1);
assert.equal(restored.elicitation_history![1].decision!.observation_id, restored.research.observations[0].id);
assert.notEqual(restored.research.observations[0].id, answered.decision!.observation_id);
assert.equal(restored.research.observations[0].text, answered.decision!.answer);
assert.ok(after.leaderIds.length < before.leaderIds.length);
assert.equal(after.validationCount, before.validationCount + 1);
console.log(JSON.stringify({ passed: true, profiles: 2, records: 4, decisions: ['decline', 'answer'],
  requestedInteger: before.selection!.value, observedForm: answered.decision!.answer,
  leadingCandidatesBefore: before.leaderIds.length, leadingCandidatesAfter: after.leaderIds.length,
  exactHistoricalPayloads: true, remappedAnswerCapture: true, restoredApplicationBlocked: true,
  answerSource: 'independent synthetic fixture renderer', modelCalls: 0, learningCurveEvaluation: false }));
