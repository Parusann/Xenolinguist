import { ollamaBaseUrl, defaultModel } from '../config.js';
import type { ModelCapability, ModelInventory } from '../../../shared/schemas/capabilities.js';
import { RuntimeError } from './runtime-error.js';

export function localOllamaUrl() {
  const url = new URL(ollamaBaseUrl());
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new RuntimeError('OLLAMA_REMOTE_HOST', 'Local mode requires a loopback Ollama service');
  return url.origin;
}
export async function ollamaJson(route: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(localOllamaUrl() + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]) });
  if (!response.ok) throw new RuntimeError('OLLAMA_UNAVAILABLE', `Ollama probe failed (${response.status})`);
  return response.json();
}
export function classifyModel(tag: Record<string, unknown>, show?: Record<string, unknown>): ModelCapability {
  const name = typeof tag.name === 'string' ? tag.name : '';
  const remoteHost = String(show?.remote_host || tag.remote_host || ''), remoteModel = String(show?.remote_model || tag.remote_model || '');
  const reportedCapabilities = show?.capabilities ?? tag.capabilities;
  const capabilities = Array.isArray(reportedCapabilities) ? reportedCapabilities.filter((v): v is string => typeof v === 'string') : [];
  const digest = typeof tag.digest === 'string' ? tag.digest : '', size = typeof tag.size === 'number' && Number.isFinite(tag.size) ? tag.size : 0;
  const location = remoteHost || remoteModel || /(?:^|[-:])cloud(?:$|[-:])/i.test(name) ? 'remote' : show && digest && size > 0 && show.model_info && Object.keys(show.model_info).length > 0 ? 'local' : 'unknown';
  const eligible = location === 'local' && capabilities.includes('completion');
  return { name, digest, size, capabilities, location, eligible, reason: eligible ? 'Local completion model verified' : location === 'remote' ? 'Remote-backed model is disabled in local mode' : location === 'unknown' ? 'Local model metadata could not be verified' : 'Model does not support completion', ...(remoteHost ? { remoteHost } : {}), ...(remoteModel ? { remoteModel } : {}) };
}
let cache: { host: string; value: ModelInventory } | undefined;
export function clearModelCache() { cache = undefined; }
export async function getModelInventory(force = false): Promise<ModelInventory> {
  const host = ollamaBaseUrl();
  if (!force && cache?.host === host && Date.parse(cache.value.expiresAt) > Date.now()) return cache.value;
  const checkedAt = new Date().toISOString();
  let result: ModelInventory = { connected: false, ready: false, models: [], inventory: [], checkedAt, expiresAt: new Date(Date.now() + 5000).toISOString(), defaultModel: defaultModel() };
  try {
    const tags = await ollamaJson('/api/tags');
    if (!Array.isArray(tags.models) || tags.models.length > 100) throw new RuntimeError('MODEL_INVENTORY_INVALID', 'Model inventory is invalid or exceeds 100 entries');
    const inventory: ModelCapability[] = [];
    // Probe in bounded groups; status cannot fan out an unbounded number of requests.
    for (let i = 0; i < tags.models.length; i += 4) inventory.push(...await Promise.all(tags.models.slice(i, i + 4).map(async (tag: Record<string, unknown>) => {
      if (classifyModel(tag).location === 'remote') return classifyModel(tag);
      try { return classifyModel(tag, await ollamaJson('/api/show', { model: tag.name })); } catch { return classifyModel(tag); }
    })));
    result = { ...result, connected: true, ready: inventory.some(m => m.eligible), inventory, models: inventory.filter(m => m.eligible).map(m => m.name) };
  } catch (error) { result.error = error instanceof RuntimeError ? error.message : 'Start the local Ollama service to use chat'; }
  cache = { host, value: result }; return result;
}
/** Re-check the selected tag and metadata at execution time, including after queueing. */
export async function requireLocalModel(name: string, signal: AbortSignal) {
  const tags = await ollamaJson('/api/tags', undefined, signal);
  const tag = tags.models?.find((m: { name: string }) => m.name === name);
  if (!tag) throw new RuntimeError('MODEL_MISSING', 'The selected model is not installed');
  if (classifyModel(tag).location === 'remote') throw new RuntimeError('MODEL_NOT_LOCAL_CHAT', 'Remote-backed model is disabled in local mode', 422);
  const model = classifyModel(tag, await ollamaJson('/api/show', { model: name }, signal));
  if (!model.eligible) throw new RuntimeError('MODEL_NOT_LOCAL_CHAT', model.reason, 422);
  return model;
}
