// Exercise the authenticated bundled backend against already-installed local Ollama models.
// This verifier never pulls models or sends a prompt to a remote-backed model.
import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect } from '@playwright/test';
import { root, sourceIdentity, saveRecord } from './verification-record.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'xeno-acceptance-chat-'));
const secret = randomBytes(32).toString('hex'), record = { source: sourceIdentity(), checks: {} };
const child = fork(path.join(root, 'electron/dist/server.cjs'), [], { cwd: directory, env: { ...process.env, DATA_DIR: directory, PORT: '0', NODE_ENV: 'test', OLLAMA_BASE_URL: 'http://127.0.0.1:11434', XENO_START: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
let output = '';
try {
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Backend did not start')), 15000);
    child.once('error', reject);
    child.stdout.on('data', data => { output += data.toString(); const port = output.match(/ready on (\d+)/)?.[1]; if (port) { clearTimeout(timer); resolve('http://127.0.0.1:' + port); } });
    child.stderr.on('data', data => { output += data.toString(); });
    child.send({ secret, mode: 'desktop' });
  });
  const request = async (route, body) => fetch(origin + route, { method: body ? 'POST' : 'GET', headers: { 'X-Xeno-Session': secret, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(190000) });
  const status = await (await request('/api/ollama/status')).json();
  expect(status.connected).toBe(true); expect(status.ready).toBe(true);
  const selected = status.inventory.find(model => model.name === status.defaultModel);
  expect(selected?.eligible).toBe(true); record.model = selected;
  for (const [category, candidate] of [['remote', status.inventory.find(model => model.location === 'remote')], ['embedding', status.inventory.find(model => model.capabilities.includes('embedding') && !model.eligible)]]) {
    if (!candidate) { record.checks[category] = { availableForTest: false }; continue; }
    const response = await request('/api/ai/chat', { model: candidate.name, messages: [{ role: 'user', content: 'This prompt must be rejected before inference.' }] });
    expect(response.status).toBe(422); record.checks[category] = { availableForTest: true, status: response.status, code: (await response.json()).code };
  }
  const start = Date.now();
  const response = await request('/api/ai/chat', { model: selected.name, task: 'quickSuggest', messages: [{ role: 'user', content: 'In this invented dictionary, tal means sky and mi means blue. Translate tal mi. Reply only with the two English words.' }] });
  const body = await response.json(); expect(response.status).toBe(200); expect(body.content.toLowerCase()).toContain('sky blue');
  record.checks.localChat = { status: response.status, content: body.content, elapsedMs: Date.now() - start };
  const streaming = await request('/api/ai/stream', { model: selected.name, task: 'chat', messages: [{ role: 'user', content: 'Write a detailed, long explanation of how to compare two invented dictionaries, including twenty worked examples.' }] });
  const reader = streaming.body.getReader(), decoder = new TextDecoder(); let frames = '';
  while (!frames.includes('"token"')) { const chunk = await reader.read(); if (chunk.done) throw Error('Generation ended before cancellation probe'); frames += decoder.decode(chunk.value, { stream: true }); }
  const cancelledId = streaming.headers.get('x-xeno-job');
  const cancelStart = Date.now();
  const cancel = await fetch(origin + '/api/jobs/' + cancelledId, { method: 'DELETE', headers: { 'X-Xeno-Session': secret } });
  expect(cancel.status).toBe(202);
  while (true) { const chunk = await reader.read(); if (chunk.done) break; frames += decoder.decode(chunk.value, { stream: true }); }
  reader.releaseLock(); expect(frames).toContain('JOB_CANCELLED');
  record.checks.liveGenerationCancellation = { receivedTokenBeforeCancel: true, status: cancel.status, cleanupMs: Date.now() - cancelStart };
  const retry = await request('/api/ai/chat', { model: selected.name, task: 'quickSuggest', messages: [{ role: 'user', content: 'Reply only with the word ready.' }] });
  expect(retry.status).toBe(200); record.checks.afterCancellation = { status: retry.status, content: (await retry.json()).content };
  const work = await (await request('/api/jobs')).json();
  expect(work.jobs.some(job => ['running', 'queued'].includes(job.state))).toBe(false);
  record.checks.jobsSettled = true; expect(output).not.toContain(secret);
  record.acceptancePassed = true;
} catch (error) { record.acceptancePassed = false; record.failure = error.message; process.exitCode = 1; }
finally {
  if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  record.limits = ['One synthetic dictionary prompt, not a linguistic quality benchmark.', 'Uses models already installed on this host; no new downloads.', 'Actual backend generation, cancellation after a token and successful subsequent generation are exercised; download failure paths use deterministic protocol fixtures.'];
  await saveRecord(path.join(root, 'test-results/w10-local-chat.json'), record);
}
