import { beforeEach, afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { createLocalSession } from '../middleware/local-session.js';
import { clearModelCache } from '../services/ollama-runtime.js';
import { jobs } from '../services/job-manager.js';

let upstream: Server, app: Server, origin: string, headers: Record<string, string>;
let remote = false, embedding = false, mode = 'complete', started = 0, stopped = 0, pullStarted = 0, options: Record<string, unknown>;
const model = 'gemma4:e4b';
async function listen(server: Server) { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${(server.address() as AddressInfo).port}`; }
beforeEach(async () => {
  remote = false; embedding = false; mode = 'complete'; started = 0; stopped = 0; pullStarted = 0;
  upstream = createServer(async (req, res) => {
    let input = ''; for await (const chunk of req) input += chunk;
    const body = input ? JSON.parse(input) : {};
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: model, size: 10000, digest: 'test-digest' }] }));
    if (req.url === '/api/show') return res.end(JSON.stringify({ capabilities: [embedding ? 'embedding' : 'completion'], model_info: { architecture: 'fixture' }, ...(remote ? { remote_model: 'cloud-alias' } : {}) }));
    if (req.url === '/api/pull') {
      pullStarted++; res.write('{"status":"down');
      if (mode === 'pull-stream') { res.write('loading"}\n'); res.once('close', () => { stopped++; }); return; }
      const timer = setTimeout(() => res.end('loading","completed":5,"total":10}\n{"status":"success"}\n'), 20);
      res.once('close', () => clearTimeout(timer)); return;
    }
    if (req.url === '/api/chat') {
      started++; options = body.options;
      if (mode === 'complete') return res.end('{"message":{"content":"sky blue"},"done":true}\n');
      if (mode === 'broken') return res.end('{"message":{"content":"partial answer"}}\n');
      res.write('{"message":{"content":"first token"}}\n');
      const timer = setInterval(() => res.write('{"message":{"content":"."}}\n'), 25);
      res.once('close', () => { clearInterval(timer); stopped++; }); return;
    }
    res.statusCode = 404; res.end();
  });
  process.env.OLLAMA_BASE_URL = await listen(upstream); clearModelCache();
  const session = createLocalSession(); headers = { 'X-Xeno-Session': session.secret, 'Content-Type': 'application/json' };
  app = createServer(createApp(session)); origin = await listen(app);
});
it('cancels a download upstream and allows an explicit retry', async () => {
  mode = 'pull-stream';
  const start = () => fetch(origin + '/api/ollama/pull', { method: 'POST', headers, body: JSON.stringify({ model, confirmed: true }) });
  const first = await (await start()).json(); await expect.poll(() => pullStarted).toBe(1);
  expect((await start()).status).toBe(409);
  await fetch(origin + '/api/jobs/' + first.jobId, { method: 'DELETE', headers });
  await expect.poll(() => stopped).toBe(1);
  await expect.poll(() => jobs.list().find(job => job.id === first.jobId)?.state).toBe('cancelled');
  mode = 'complete'; const retry = await (await start()).json();
  await expect.poll(() => jobs.list().find(job => job.id === retry.jobId)?.state).toBe('succeeded');
});
afterEach(async () => {
  for (const job of jobs.list()) jobs.cancel(job.id);
  app.closeAllConnections(); upstream.closeAllConnections();
  await Promise.all([app, upstream].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  delete process.env.OLLAMA_BASE_URL; clearModelCache();
});
const chat = (signal?: AbortSignal) => fetch(origin + '/api/ai/stream', { method: 'POST', headers, signal, body: JSON.stringify({ model, task: 'quickSuggest', messages: [{ role: 'user', content: 'test' }] }) });
it('separates service reachability from readiness and rejects cloud aliases and embedding at execution', async () => {
  for (const type of ['remote', 'embedding']) {
    remote = type === 'remote'; embedding = type === 'embedding'; clearModelCache();
    const status = await (await fetch(origin + '/api/ollama/status', { headers })).json();
    expect(status).toMatchObject({ connected: true, ready: false, models: [] });
    const response = await fetch(origin + '/api/ai/chat', { method: 'POST', headers, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'test' }] }) });
    expect(response.status).toBe(422);
  }
  expect(started).toBe(0);
});
it('cancels upstream work on disconnect and then lets queued generation execute', async () => {
  mode = 'stream'; const controller = new AbortController();
  const first = await chat(controller.signal); const firstReader = first.body!.getReader();
  await firstReader.read(); await expect.poll(() => started).toBe(1);
  const secondController = new AbortController(); const second = await chat(secondController.signal);
  await expect.poll(() => jobs.list().filter(job => job.state === 'queued').length).toBe(1);
  controller.abort(); await expect.poll(() => stopped).toBe(1); await expect.poll(() => started).toBe(2);
  const id = second.headers.get('x-xeno-job')!;
  expect((await fetch(origin + '/api/jobs/' + id, { method: 'DELETE', headers })).status).toBe(202);
  await second.text(); await expect.poll(() => stopped).toBe(2);
  await expect.poll(() => jobs.list().find(job => job.id === id)?.state).toBe('cancelled');
  expect(options).toMatchObject({ num_ctx: 4096, num_predict: 512, temperature: 0.2, seed: 42 });
});
it('reports a truncated upstream stream after partial output and downloads only after confirmation', async () => {
  mode = 'broken'; const response = await chat(); const text = await response.text();
  expect(text).toContain('partial answer'); expect(text).toContain('STREAM_INCOMPLETE'); expect(text).not.toContain('[DONE]');
  expect(pullStarted).toBe(0);
  expect((await fetch(origin + '/api/ollama/pull', { method: 'POST', headers, body: JSON.stringify({ model }) })).status).toBe(400);
  const pull = await (await fetch(origin + '/api/ollama/pull', { method: 'POST', headers, body: JSON.stringify({ model, confirmed: true }) })).json();
  await expect.poll(() => jobs.list().find(job => job.id === pull.jobId)?.state).toBe('succeeded');
  expect(pullStarted).toBe(1);
});
