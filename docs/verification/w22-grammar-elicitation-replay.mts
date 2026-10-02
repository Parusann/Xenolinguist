import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseProfile } from '../../shared/schemas/profile.js';
import { verifyResearch } from '../../server/src/services/research-integrity.js';
import { verifyGrammarElicitation, grammarReport, grammarState, grammarEvidence } from '../../server/src/services/grammar-elicitation-integrity.js';
import { stableKey } from '../../engine/src/elicitation/contracts.js';

const load = async (name: string) => parseProfile(JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8')));
const original = await load('./w22-grammar-elicitation-profile.json');
const restored = await load('./w22-grammar-elicitation-restored-profile.json');
for (const profile of [original, restored]) { verifyResearch(profile); verifyGrammarElicitation(profile); }
assert.notEqual(original.id, restored.id);
assert.equal(original.grammar_elicitation_history?.length, 2);
assert.equal(restored.grammar_elicitation_history?.length, 2);
for (let index = 0; index < 2; index++) {
  const before = original.grammar_elicitation_history![index], after = restored.grammar_elicitation_history![index];
  assert.equal(after.id, before.id);
  for (const key of ['source_json', 'source_sha256', 'context_sha256', 'request_sha256', 'input_sha256', 'report_json', 'report_sha256'] as const) assert.equal(after[key], before[key]);
  assert.equal(after.archived, true); assert.equal(grammarState(restored, after).canDecide, false);
  const action = index === 0 ? 'decline' : 'answer';
  assert.equal(before.decision?.action, action); assert.equal(after.decision?.action, action);
  for (const key of ['action', 'answer', 'reason', 'mutation_id', 'digest', 'created_at', 'applied_revision', 'after_json', 'after_sha256'] as const) assert.equal(after.decision![key], before.decision![key]);
}
const declined = original.grammar_elicitation_history![0], answered = original.grammar_elicitation_history![1];
assert.equal(declined.decision!.observation_id, null); assert.equal(declined.decision!.after_json, null);
const before = grammarReport(answered), after = JSON.parse(answered.decision!.after_json!);
assert.notEqual(stableKey(before.selection!.meaning), stableKey(grammarReport(declined).selection!.meaning));
assert.equal(original.research.observations.length, 1); assert.equal(restored.research.observations.length, 1);
assert.equal(restored.grammar_elicitation_history![1].decision!.observation_id, restored.research.observations[0].id);
assert.notEqual(restored.research.observations[0].id, answered.decision!.observation_id);
assert.equal(restored.research.observations[0].text, answered.decision!.answer);
assert.equal(before.remaining.length, 2); assert.deepEqual(after.remaining, ['A']);
assert.equal(after.evidenceCount, before.evidenceCount + 1);
assert.equal(grammarEvidence(original, answered.context_sha256).length, 1);
assert.equal(grammarEvidence(restored, answered.context_sha256).length, 0);
assert.deepEqual(restored.grammar_rules.map(r => r.executable), original.grammar_rules.map(r => r.executable));
assert.equal(original.research.hypotheses.length, 0);
console.log(JSON.stringify({ passed: true, profiles: 2, records: 4, decisions: ['decline', 'answer'],
  requestedMeaning: before.selection!.meaning, observedForm: answered.decision!.answer,
  alternativesBefore: before.remaining.length, alternativesAfter: after.remaining.length,
  exactHistoricalPayloads: true, remappedAnswerCapture: true, restoredApplicationBlocked: true,
  rulesAutomaticallyAccepted: 0, answerSource: 'independent synthetic fixture', modelCalls: 0, learningCurveEvaluation: false }));
