import { expect, it, afterEach, vi } from 'vitest';
import { classifyModel, getModelInventory, clearModelCache, localOllamaUrl, requireLocalModel } from '../services/ollama-runtime.js';
const tag = { name: 'local:small', size: 1000, digest: 'abc' }, show = { model_info: { architecture: 'test' }, capabilities: ['completion'] };
afterEach(() => { vi.unstubAllGlobals(); delete process.env.OLLAMA_BASE_URL; clearModelCache(); });
it('accepts verified local completion metadata and preserves identity', () => {
  expect(classifyModel(tag, show)).toMatchObject({ eligible: true, digest: 'abc', size: 1000, capabilities: ['completion'], location: 'local' });
});
it.each([{ remote_host: 'https://ollama.com' }, { remote_model: 'hidden-cloud' }, { capabilities: ['embedding'] }, { model_info: undefined }])('rejects remote, embedding and unverified models even under ordinary names', patch => {
  expect(classifyModel(tag, { ...show, ...patch }).eligible).toBe(false);
});
it('rejects cloud aliases from tags and rejects remote service configuration', () => {
  expect(classifyModel({ ...tag, remote_model: 'cloud-model' }, show).eligible).toBe(false);
  process.env.OLLAMA_BASE_URL = 'https://example.com'; expect(localOllamaUrl).toThrow('loopback');
});
it('does not ask Ollama to show a model already marked remote in its inventory', async () => {
  const fetcher = vi.fn(async () => Response.json({ models: [{ ...tag, remote_model: 'cloud' }] }));
  vi.stubGlobal('fetch', fetcher);
  expect((await getModelInventory()).ready).toBe(false);
  await expect(requireLocalModel(tag.name, new AbortController().signal)).rejects.toMatchObject({ code: 'MODEL_NOT_LOCAL_CHAT' });
  expect(fetcher.mock.calls).toHaveLength(2);
});
it('caches display probes but rechecks model eligibility for execution', async () => {
  let cloud = false;
  const fetcher = vi.fn(async (url: string) => Response.json(url.endsWith('/tags') ? { models: [tag] } : { ...show, ...(cloud ? { remote_model: 'cloud' } : {}) }));
  vi.stubGlobal('fetch', fetcher);
  expect((await getModelInventory()).ready).toBe(true); await getModelInventory(); expect(fetcher).toHaveBeenCalledTimes(2);
  cloud = true;
  await expect(requireLocalModel(tag.name, new AbortController().signal)).rejects.toMatchObject({ code: 'MODEL_NOT_LOCAL_CHAT' });
  expect(fetcher).toHaveBeenCalledTimes(4);
  clearModelCache(); vi.stubGlobal('fetch', vi.fn(async () => { throw Error('offline'); }));
  expect(await getModelInventory()).toMatchObject({ connected: false, ready: false, models: [] });
});
