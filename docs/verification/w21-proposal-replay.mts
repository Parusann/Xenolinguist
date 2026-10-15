import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseProfile } from '../../shared/schemas/profile.js';
import { proposalRequestSchema, researchProposalSchema, PROPOSAL_LIMITS } from '../../shared/schemas/proposals.js';
import { RESEARCH_PROPOSAL_PROMPT } from '../../shared/prompts.js';
import { canonical } from '../../engine/src/evidence/dependencies.js';
import { buildResearchContext } from '../../server/src/services/context-builder.js';
import { validateProposal } from '../../server/src/services/proposal-validator.js';
import { createHypothesisTools } from '../../server/src/services/tools/registry.js';
import { proposalOutputFormat } from '../../server/src/services/proposal-format.js';

const record = JSON.parse(await readFile(new URL('./w21-proposal-local-model.json', import.meta.url), 'utf8'));
const profile = parseProfile(record.profile), request = proposalRequestSchema.parse(record.request);
const result = record.result, proposal = researchProposalSchema.parse(result.proposal), provenance = result.provenance;
assert.equal(record.status, 200); assert.equal(record.persisted_profile_unchanged, true);
assert.equal(request.profile_id, profile.id); assert.equal(request.expectedRevision, profile.revision);
assert.equal(result.state, 'proposed'); assert.equal(provenance.origin, 'local-model');
assert.match(provenance.model_digest, /^[a-f0-9]{64}$/);
assert.equal(provenance.model, request.model);
assert.ok(provenance.calls.length <= PROPOSAL_LIMITS.calls && provenance.repair_attempts <= 1);
assert.ok(provenance.tool_calls.length <= PROPOSAL_LIMITS.tools);
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const context = buildResearchContext(profile, request.query);
assert.equal(canonical(context), canonical(provenance.context));
assert.equal(sha256(`${RESEARCH_PROPOSAL_PROMPT}\nResponse schema:\n${JSON.stringify(proposalOutputFormat())}`), provenance.prompt_template_sha256);
assert.equal(sha256(JSON.stringify({ query: request.query, context, validation_samples: request.validation_sample_ids.map(id => {
  const sample = profile.samples.find(s => s.id === id)!;
  return { id, source: sample.alien_text, user_target: sample.english_translation };
}) })), provenance.context_sha256);
const validation = validateProposal(profile, proposal, request.validation_sample_ids);
assert.equal(canonical(validation), canonical(result.validation));
assert.equal(validation.input_sha256, provenance.input_sha256);
const tools = createHypothesisTools(profile, request.validation_sample_ids, new AbortController().signal);
for (const call of provenance.tool_calls) assert.equal(canonical(tools.execute(call.action)), canonical(call.result));
// Demonstrate the counterexample independently of what the model chose in this one smoke.
const wrong = { ...proposal, content: { kind: 'grammar', rule_id: 'tense',
  rule: { kind: 'tense-affix', position: 'prefix', affix: 'pa-', tense: 'future' } } };
const counterexample = validateProposal(profile, wrong, request.validation_sample_ids);
assert.equal(counterexample.status, 'falsified');
assert.equal(counterexample.checks[0].after.rendered, 'I will speak');
assert.equal(counterexample.checks[0].expected, 'I did speak');
console.log(JSON.stringify({ passed: true, deterministicToolsReplayed: tools.iterations, validation: validation.status,
  counterexample: counterexample.checks[0], modelGenerationReplayed: false, heldOutEvaluation: false }));
