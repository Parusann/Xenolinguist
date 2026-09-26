import { createHash } from 'node:crypto';
import { proposalActionSchema, proposalRequestSchema, PROPOSAL_LIMITS, type ProposalAction } from '../../../shared/schemas/proposals.js';
import { RESEARCH_PROPOSAL_PROMPT } from '../../../shared/prompts.js';
import type { AIMessage, LanguageProfile } from '../../../shared/types.js';
import { canonical } from '../../../engine/src/evidence/dependencies.js';
import { buildResearchContext } from './context-builder.js';
import { validateProposal, proposalInputHash } from './proposal-validator.js';
import { createHypothesisTools } from './tools/registry.js';
import { AIService, TASK_BUDGETS } from './ai-service.js';
import { requireLocalModel } from './ollama-runtime.js';
import { RuntimeError } from './runtime-error.js';
import { proposalOutputFormat } from './proposal-format.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const format = proposalOutputFormat();
const system = `${RESEARCH_PROPOSAL_PROMPT}\nResponse schema:\n${JSON.stringify(format)}`;
type Transport = Pick<AIService, 'chat'>;
/** Runs inside the existing llm job lane. No persistence or knowledge mutation occurs here. */
export async function runResearchProposal(profile: LanguageProfile, input: unknown, callerSignal: AbortSignal,
  transport: Transport = new AIService(), resolveModel = requireLocalModel) {
  const request = proposalRequestSchema.parse(input), snapshot = structuredClone(profile);
  if (request.profile_id !== snapshot.id || request.expectedRevision !== snapshot.revision)
    throw new RuntimeError('REVISION_CONFLICT', 'Research requires the selected profile revision', 409);
  for (const id of request.validation_sample_ids) if (!snapshot.samples.some(s => s.id === id && s.english_translation?.trim()
    && s.alien_text.length <= 2048 && s.english_translation.length <= 2048))
    throw new RuntimeError('PROPOSAL_TEST_INVALID', 'Select existing bounded samples with user-supplied targets', 422);
  const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(PROPOSAL_LIMITS.deadlineMs)]), started = Date.now();
  signal.throwIfAborted();
  const model = await resolveModel(request.model, signal);
  signal.throwIfAborted();
  const context = buildResearchContext(snapshot, request.query), tools = createHypothesisTools(snapshot, request.validation_sample_ids, signal);
  const userData = JSON.stringify({ query: request.query, context,
    validation_samples: request.validation_sample_ids.map(id => {
      const s = snapshot.samples.find(s => s.id === id)!;
      return { id, source: s.alien_text, user_target: s.english_translation };
    }) });
  const messages: AIMessage[] = [{ role: 'user', content: userData }];
  const calls: { request_sha256: string; response_sha256: string; elapsed_ms: number; valid_structure: boolean }[] = [];
  const toolCalls: { action: ProposalAction; result: ReturnType<typeof tools.execute> }[] = [];
  let repairs = 0;
  for (let call = 0; call < PROPOSAL_LIMITS.calls; call++) {
    signal.throwIfAborted();
    // Actual serialized input is checked by AIService before inference; never silently truncate.
    const callStarted = Date.now(), requestHash = sha256(canonical({ system, messages, format }));
    const raw = await transport.chat(messages, { system, model: model.name, expectedDigest: model.digest,
      task: 'researchProposal', signal, format });
    signal.throwIfAborted();
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { decoded = null; }
    const parsed = proposalActionSchema.safeParse(decoded);
    calls.push({ request_sha256: requestHash, response_sha256: sha256(raw), elapsed_ms: Date.now() - callStarted, valid_structure: parsed.success });
    if (!parsed.success) {
      if (repairs++ || call === PROPOSAL_LIMITS.calls - 1) throw new RuntimeError('PROPOSAL_STRUCTURE_INVALID', 'Model output failed structure validation after the single repair budget', 422);
      // Do not retain or feed back arbitrary invalid output or a model's thinking field.
      messages.push({ role: 'user', content: 'Return exactly one valid JSON action. Correct these schema errors: ' +
        JSON.stringify(parsed.error.issues.slice(0, 8).map(i => ({ path: i.path, code: i.code }))) });
      continue;
    }
    const action = parsed.data;
    if (action.tool === 'finish') {
      const validation = validateProposal(snapshot, action.proposal, request.validation_sample_ids);
      return { version: 'research-proposal-run-1' as const, state: 'proposed' as const, proposal: action.proposal, validation,
        provenance: { origin: 'local-model' as const, model: model.name, model_digest: model.digest, profile_id: snapshot.id, profile_revision: snapshot.revision,
          input_sha256: proposalInputHash(snapshot, request.validation_sample_ids), prompt_template_sha256: sha256(system), context_sha256: sha256(userData),
          context, validation_sample_ids: [...request.validation_sample_ids], query: request.query,
          settings: { ...TASK_BUDGETS.researchProposal, temperature: 0.2, seed: 42, think: false, structured_output: true },
          budget: { ...PROPOSAL_LIMITS, total_output_token_ceiling: PROPOSAL_LIMITS.calls * PROPOSAL_LIMITS.outputPerCall },
          calls, tool_calls: toolCalls, repair_attempts: repairs, elapsed_ms: Date.now() - started, completed_at: new Date().toISOString() } };
    }
    const result = tools.execute(action); toolCalls.push({ action, result });
    // The full typed trace is returned to the caller; a bounded summary is fed to the next generation.
    const feedback = 'checks' in result ? { ...result, checks: result.checks.map(c => ({ sample_id: c.sample_id,
      before: c.before.outcome, after: c.after.outcome, rendered: c.after.rendered?.slice(0, 256), regression: c.regression })) } : result;
    messages.push({ role: 'assistant', content: JSON.stringify(action) }, { role: 'user', content: JSON.stringify({ tool_result: feedback,
      remaining_tools: PROPOSAL_LIMITS.tools - tools.iterations, instruction: tools.iterations === PROPOSAL_LIMITS.tools ? 'Finish now.' : 'Inspect more data or finish.' }) });
  }
  throw new RuntimeError('PROPOSAL_CALL_LIMIT', 'Model did not finish within the research call budget', 422);
}
export type ResearchProposalRun = Awaited<ReturnType<typeof runResearchProposal>>;
