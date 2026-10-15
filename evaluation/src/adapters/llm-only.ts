import { localOllamaUrl, ollamaJson, requireLocalModel } from '../../../server/src/services/ollama-runtime.js';
import { atoms, predictionSchema, type Input, type Output, type Context, type Status, type Atom } from '../contracts.js';
import { PRIOR } from './prior.js';

export const PROMPT_VERSION = 'baseline-prompt-1';
export function messages(input: Input, hints?: unknown) {
  return [{ role: 'system', content: `${PRIOR}\nReturn one JSON object only: {"predictions":[{"id":"challenge id","meaning":null or a scene in the observation schema}],"lexicon":{"alien token":"English atom"}}.
Return every challenge id exactly once. Lexicon values must be one of ${atoms.join(', ')}; omit uncertain tokens. Never include commentary or probabilities.` },
  { role: 'user', content: JSON.stringify({ observations: input.observations, challenges: input.challenges, lexicalProbes: input.lexicalProbes,
    ...(hints ? { inferredHints: hints } : {}) }) }];
}
export type Completion = (input: ReturnType<typeof messages>, context: Context) => Promise<{ raw: string; provenance: Record<string, unknown> }>;
export const localCompletion: Completion = async (input, context) => {
  const options = { temperature: context.settings.temperature, num_ctx: context.settings.num_ctx, num_predict: context.settings.num_predict, seed: context.modelSeed };
  let raw: string | null = null;
  const provenance: Record<string, unknown> = { requestedModel: context.settings.name, expectedDigest: context.expectedDigest ?? null,
    options, promptVersion: PROMPT_VERSION, request: { stream: false, think: false, format: 'json', keep_alive: '10m', truncate: false } };
  try {
    const signal = AbortSignal.any([AbortSignal.timeout(context.settings.timeoutMs), ...(context.signal ? [context.signal] : [])]);
    const model = await requireLocalModel(context.settings.name, signal);
    provenance.model = model;
    if (context.expectedDigest && model.digest !== context.expectedDigest) throw new Error('Model differs from experiment preflight digest');
    const version = await ollamaJson('/api/version', undefined, signal);
    provenance.ollamaVersion = version.version;
    const response = await fetch(localOllamaUrl() + '/api/chat', { method: 'POST', redirect: 'error', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model.name, messages: input, stream: false, think: false, format: 'json', keep_alive: '10m', truncate: false, options }) });
    if (!response.ok) throw new Error(`Local inference HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const body = await response.json();
    raw = typeof body.message?.content === 'string' ? body.message.content : null;
    Object.assign(provenance, { doneReason: body.done_reason, promptTokens: body.prompt_eval_count, outputTokens: body.eval_count,
      totalDurationNs: body.total_duration, loadDurationNs: body.load_duration, promptDurationNs: body.prompt_eval_duration, outputDurationNs: body.eval_duration });
    if (body.remote_host || body.remote_model) throw new Error('Remote-backed response rejected');
    if (body.done !== true) throw new Error('Incomplete model response');
    if (typeof body.message?.content !== 'string') throw new Error('Missing completion content');
    // A tag is mutable: reject a result if its digest changed while inference was running.
    const after = await requireLocalModel(context.settings.name, signal);
    if (after.digest !== model.digest) throw new Error('Model digest changed during inference');
    return { raw: body.message.content, provenance };
  } catch (error) {
    const retained = new Error(error instanceof Error ? error.message : String(error));
    retained.name = error instanceof Error ? error.name : 'Error';
    throw Object.assign(retained, { evaluation: { raw, provenance } });
  }
};
export function failed(input: Input, status: Status, detail: string): Output {
  return { predictions: input.challenges.map(c => ({ id: c.id, status, detail })), lexical: input.lexicalProbes.map(token => ({ token, status })), diagnostics: { detail } };
}
export function parseCompletion(raw: string, input: Input): Output {
  let body: { predictions?: unknown; lexicon?: unknown };
  try { body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); }
  catch { return failed(input, 'invalid', 'Response is not a JSON object'); }
  const predictions = Array.isArray(body.predictions) ? body.predictions : [];
  const lexicon = body.lexicon && typeof body.lexicon === 'object' && !Array.isArray(body.lexicon) ? body.lexicon as Record<string, unknown> : {};
  return { predictions: input.challenges.map(c => {
    const matching = predictions.filter(p => p && typeof p === 'object' && p.id === c.id);
    if (matching.length !== 1) return { id: c.id, status: 'invalid', detail: 'Missing or duplicate id' };
    if (matching[0].meaning === null) return { id: c.id, status: 'abstained' };
    const value = predictionSchema.safeParse(matching[0].meaning);
    return value.success ? { id: c.id, status: 'answered', meaning: value.data } : { id: c.id, status: 'invalid', detail: 'Invalid semantic tree' };
  }), lexical: input.lexicalProbes.map(token => {
    if (!(token in lexicon) || lexicon[token] === null) return { token, status: 'abstained' };
    return atoms.includes(lexicon[token] as Atom) ? { token, status: 'answered', value: lexicon[token] as Atom } : { token, status: 'invalid' };
  }), diagnostics: { extraIds: predictions.filter(p => !input.challenges.some(c => c.id === p?.id)).map(p => p?.id ?? null) } };
}
export async function llmOnly(input: Input, context: Context, complete: Completion = localCompletion, hints?: unknown): Promise<Output> {
  const prompt = messages(input, hints);
  try {
    const result = await complete(prompt, context);
    const output = parseCompletion(result.raw, input);
    return { ...output, diagnostics: { ...output.diagnostics, modelUsed: true, prompt, ...result } };
  } catch (error) {
    const status = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'error';
    const output = failed(input, status, error instanceof Error ? error.message : String(error));
    const retained = error && typeof error === 'object' && 'evaluation' in error ? error.evaluation : null;
    return { ...output, diagnostics: { ...output.diagnostics, modelUsed: true, prompt, settings: context.settings, modelSeed: context.modelSeed, retained } };
  }
}
