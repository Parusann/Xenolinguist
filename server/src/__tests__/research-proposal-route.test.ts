import { afterEach, beforeEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../app.js';
import { createLocalSession } from '../middleware/local-session.js';
import { ProfileStore } from '../services/profile-store.js';
import { jobs } from '../services/job-manager.js';
import { proposalFixture } from './proposal-fixture.js';
import type { ProposalRequest, ResearchProposal } from '../../../shared/schemas/proposals.js';

let app: Server, upstream: Server, root: string, origin: string, headers: Record<string, string>;
let request: ProposalRequest, proposal: ResearchProposal, outputs: string[], hang: boolean, changedDigest: boolean, probes: number, closed: number;
let inputs: Record<string, any>[];
const listen = async (server: Server) => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-proposal-route-')); process.env.DATA_DIR = root;
  hang = false; changedDigest = false; probes = 0; closed = 0; inputs = [];
  const fixture = proposalFixture(), p = await new ProfileStore().create(fixture.p);
  request = { ...fixture.request, profile_id: p.id };
  proposal = { ...fixture.proposal, scope: { profile_id: p.id, revision: p.revision } };
  outputs = [JSON.stringify({ tool: 'finish', proposal })];
  upstream = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : {};
    if (req.url === '/api/tags') { probes++; return res.end(JSON.stringify({ models: [{ name: 'fixture-model', size: 1234,
      digest: changedDigest && probes > 1 ? 'different-digest' : 'fixture-digest' }] })); }
    if (req.url === '/api/show') return res.end(JSON.stringify({ capabilities: ['completion'], model_info: { architecture: 'fixture' } }));
    if (req.url === '/api/chat') {
      inputs.push(body);
      if (hang) {
        res.write(JSON.stringify({ message: { content: '{' } }) + '\n');
        const timer = setInterval(() => res.write(JSON.stringify({ message: { content: ' ' } }) + '\n'), 20);
        res.once('close', () => { clearInterval(timer); closed++; }); return;
      }
      return res.end(JSON.stringify({ message: { content: outputs.shift() ?? '{}' }, done: true }) + '\n');
    }
    res.statusCode = 404; res.end();
  });
  process.env.OLLAMA_BASE_URL = await listen(upstream);
  const session = createLocalSession(); headers = { 'X-Xeno-Session': session.secret, 'Content-Type': 'application/json' };
  app = createServer(createApp(session)); origin = await listen(app);
});
afterEach(async () => {
  for (const job of jobs.list()) jobs.cancel(job.id);
  app.closeAllConnections(); upstream.closeAllConnections();
  await Promise.all([app, upstream].map(s => new Promise<void>(resolve => s.close(() => resolve()))));
  delete process.env.OLLAMA_BASE_URL; delete process.env.DATA_DIR;
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('xeno-proposal-route-')) throw new Error('Unsafe test cleanup');
  await fs.rm(root, { recursive: true, force: true });
});
const post = (data: unknown = request, signal?: AbortSignal) => fetch(origin + '/api/ai/research/proposal', { method: 'POST', headers, signal, body: JSON.stringify(data) });
it('returns a server-validated counterexample with structured-output settings and leaves persisted knowledge unchanged', async () => {
  const file = path.join(root, 'profiles', request.profile_id + '.json'), before = await fs.readFile(file, 'utf8');
  const response = await post(), result = await response.json();
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(result).toMatchObject({ state: 'proposed', validation: { status: 'falsified', checks: [{ after: { rendered: 'I will speak' } }] },
    provenance: { origin: 'local-model', model_digest: 'fixture-digest' }, jobId: response.headers.get('x-xeno-job') });
  expect(inputs).toHaveLength(1); expect(inputs[0]).toMatchObject({ format: expect.any(Object), think: false, truncate: false,
    options: { num_ctx: 16384, num_predict: 1024, temperature: 0.2, seed: 42 } });
  expect(inputs[0].messages[0].content).toContain('untrusted data');
  expect(await fs.readFile(file, 'utf8')).toBe(before);
});
it('refuses malformed requests, missing profiles and stale revisions before model inference', async () => {
  expect((await post({ ...request, accepted: true })).status).toBe(400);
  expect((await post({ ...request, profile_id: 'missing' })).status).toBe(404);
  expect((await post({ ...request, expectedRevision: 100 })).status).toBe(409);
  expect((await post({ ...request, validation_sample_ids: ['cross-profile-sample'] })).status).toBe(422);
  expect(probes).toBe(0); expect(inputs).toHaveLength(0);
});
it('repairs invalid structure once through the real transport and rejects a second malformed response', async () => {
  outputs = ['{', JSON.stringify({ tool: 'finish', proposal })];
  const result = await (await post()).json(); expect(result.provenance.repair_attempts).toBe(1); expect(inputs).toHaveLength(2);
  outputs = ['{}', '{}'];
  const response = await post(); expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ code: 'PROPOSAL_STRUCTURE_INVALID' }); expect(inputs).toHaveLength(4);
});
it('pins the verified local model digest throughout a research run', async () => {
  changedDigest = true;
  const response = await post(); expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: 'MODEL_CHANGED' }); expect(inputs).toHaveLength(0);
});
it('cancels upstream generation on disconnect and releases the job lane for a subsequent request', async () => {
  hang = true;
  const controller = new AbortController(), pending = post(request, controller.signal).catch(() => null);
  await expect.poll(() => inputs.length).toBe(1);
  const job = jobs.list().find(j => j.task === 'researchProposal' && j.state === 'running')!;
  controller.abort(); await pending;
  await expect.poll(() => closed).toBe(1);
  await expect.poll(() => jobs.list().find(j => j.id === job.id)?.state).toBe('cancelled');
  hang = false;
  expect((await post()).status).toBe(200);
  expect((await new ProfileStore().get(request.profile_id))!.revision).toBe(0);
});
