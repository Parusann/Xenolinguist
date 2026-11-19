import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from './config.js';
import { testFixture } from './test-fixture.js';
import { createBackup, latestBackup, verifyBackup } from './backup.js';
import { createApp } from './app.js';
import { atlasPool } from './db.js';
import { Datasets } from './datasets.js';
import { ObjectStore } from './objects.js';

const config = await loadConfig(), output = process.argv[2];
if (!output || !path.resolve(output).startsWith(config.root + path.sep)) throw new Error('Recovery results require HDD workspace storage');
await mkdir(output, { recursive: true });
const fixture = await testFixture(config, true), checks: string[] = [], started = performance.now();
const before = await statfs(config.root), password = randomBytes(32).toString('hex');
const origin = fixture.config.origin, canary = 'RECOVERY-CANARY-' + randomBytes(32).toString('hex');
const request = async (route: string, method = 'GET', body?: unknown, cookie?: string, base = origin) => fetch(base + route, {
  method, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000), redirect: 'error',
});
const account = async (label: string) => {
  const email = label + randomBytes(5).toString('hex') + '@example.invalid', password = randomBytes(24).toString('hex');
  const response = await request('/api/auth/sign-up/email', 'POST', { name: label, email, password }); assert.equal(response.status, 200);
  return { email, password, id: (await response.json()).user.id as string, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
};
const waitForJob = async (id: string, cookie: string) => {
  const deadline = performance.now() + 60000;
  while (performance.now() < deadline) {
    const response = await request('/api/jobs/' + id, 'GET', undefined, cookie), job = await response.json();
    if (job.status === 'complete') return job;
    if (['failed', 'cancelled'].includes(job.status)) throw new Error('Recovery fixture computation failed: ' + job.error_code);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Recovery fixture comparison timed out');
};
const enqueue = async (version: string, cookie: string) => {
  const response = await request('/api/versions/' + version + '/jobs', 'POST', { key: randomUUID() }, cookie); assert.equal(response.status, 202); return response.json();
};
try {
  const a = await account('recovery-a'), b = await account('recovery-b');
  const catalog = await (await request('/api/reference-languages', 'GET', undefined, a.cookie)).json(), english = catalog.find((item: { id: string }) => item.id === 'English');
  const content = JSON.stringify(english.entries.slice(0, 8).map((entry: { id: string; form: string; meaning: string }) => ({ id: entry.id, form: entry.form, meaning: entry.meaning, annotations: canary })));
  const dataset = await (await request('/api/datasets', 'POST', { title: 'Recovery reference exercise', languageKind: 'known' }, a.cookie)).json();
  const payload = { key: randomUUID(), format: 'json', content, metadata: { rights: { creator: 'WOLD English contributors', license: 'CC-BY-4.0' } } };
  const upload = await request('/api/datasets/' + dataset.id + '/versions', 'POST', payload, a.cookie); assert.equal(upload.status, 201); const version = await upload.json();
  const datasetB = await (await request('/api/datasets', 'POST', { title: 'Other private recovery evidence', languageKind: 'synthetic' }, b.cookie)).json();
  assert.equal((await request('/api/datasets/' + datasetB.id + '/versions', 'POST', { ...payload, key: randomUUID(), format: 'text', content: 'Private reproducible sample' }, b.cookie)).status, 201);
  const job = await enqueue(version.id, a.cookie), complete = await waitForJob(job.id, a.cookie);
  const pool = atlasPool(fixture.config.databaseUrl, 1);
  try {
    const store = new ObjectStore(fixture.config.objects), initial = (await store.inventory()).length;
    const constrained = new Datasets(pool, new ObjectStore(fixture.config.objects, async () => 0));
    await assert.rejects(constrained.upload(a.id, dataset.id, { ...payload, key: randomUUID() }), /reserved headroom/u);
    const missing = new Datasets(pool, new ObjectStore(path.join(fixture.location, 'missing-storage')));
    await assert.rejects(missing.upload(a.id, dataset.id, { ...payload, key: randomUUID() }));
    assert.equal((await store.inventory()).length, initial);
    assert.equal((await fixture.runtime.datasets.detail(a.id, dataset.id)).versions.length, 1);
    checks.push('Injected zero free space and a missing storage path roll back upload publication without creating objects or versions');
  } finally { await pool.end(); }
  const recovery = { password, directory: path.join(fixture.location, 'recovery') };
  const priorSnapshot = await createBackup(fixture.config, recovery);
  const snapshot = await createBackup(fixture.config, recovery);
  assert.notEqual(snapshot.snapshotId, priorSnapshot.snapshotId);
  assert(Date.parse(snapshot.createdAt) > Date.parse(priorSnapshot.createdAt));
  const latestSnapshot = await latestBackup(fixture.config, recovery);
  assert.equal(latestSnapshot, snapshot.snapshotId, 'Latest must select the newest snapshot across distinct staging paths');
  checks.push('Two successive backups use distinct staging paths and latest selects the newer snapshot for complete recovery');
  const files = await readdir(path.join(recovery.directory, 'repository'), { recursive: true, withFileTypes: true });
  for (const entry of files) if (entry.isFile()) assert.equal((await readFile(path.join(entry.parentPath, entry.name))).includes(Buffer.from(canary)), false);
  checks.push('The consistent encrypted repository contains no plaintext copy of the deliberately marked upload');
  await assert.rejects(verifyBackup(fixture.config, { ...recovery, password: randomBytes(32).toString('hex') }, snapshot.snapshotId), /wrong password|no key found/iu);
  checks.push('An incorrect repository password is rejected before database recovery');
  const restored = await verifyBackup(fixture.config, recovery, latestSnapshot, async recovered => {
    const server = createServer(); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert(address && typeof address !== 'string'); const restoredOrigin = 'http://127.0.0.1:' + address.port;
    const runtime = createApp({ ...recovered, origin: restoredOrigin }); server.on('request', runtime.app);
    try {
      const signIn = async (account: { email: string; password: string }) => {
        const response = await request('/api/auth/sign-in/email', 'POST', { email: account.email, password: account.password }, undefined, restoredOrigin);
        assert.equal(response.status, 200); return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      };
      const cookieA = await signIn(a), cookieB = await signIn(b);
      assert.equal((await (await request('/api/datasets', 'GET', undefined, cookieA, restoredOrigin)).json()).length, 1);
      assert.equal((await request('/api/datasets/' + dataset.id, 'GET', undefined, cookieB, restoredOrigin)).status, 404);
      assert.equal((await request('/api/jobs/' + job.id, 'GET', undefined, cookieB, restoredOrigin)).status, 404);
      assert.equal(await (await request('/api/versions/' + version.id + '/download', 'GET', undefined, cookieA, restoredOrigin)).text(), content);
      assert.deepEqual((await (await request('/api/jobs/' + job.id, 'GET', undefined, cookieA, restoredOrigin)).json()).report, complete.report);
      checks.push('Restored passwords sign in, raw bytes and reports match, and cross-account resources remain unavailable');
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); await runtime.close(); }
  });
  assert.equal(restored.restoredAccounts, 2); assert.equal(restored.ownerScopes, 2); assert.equal(restored.replayedReports, 1);
  checks.push('All table fingerprints and object checksums match, forced RLS survives, and the saved comparison replays');
  const originalPath = path.join(fixture.config.objects, version.object_id + '.blob'), bytes = await readFile(originalPath), corrupt = Buffer.from(bytes); corrupt[0] ^= 1;
  await writeFile(originalPath, corrupt);
  try { await assert.rejects(createBackup(fixture.config, recovery), /hash differs/u); }
  finally { await writeFile(originalPath, bytes); }
  checks.push('A corrupted primary object prevents a new snapshot from being published');
  const metadata: number[] = [];
  for (let i = 0; i < 110; i++) {
    const began = performance.now(), response = await request(i % 2 ? '/api/datasets/' + dataset.id : '/api/datasets', 'GET', undefined, a.cookie);
    assert.equal(response.status, 200); await response.arrayBuffer(); if (i >= 10) metadata.push(performance.now() - began);
  }
  const bulkContent = JSON.stringify(Array.from({ length: 5000 }, (_, index) => ({ id: 'bulk-' + index,
    form: 'θ'.repeat(96), meaning: english.entries[index % 8].meaning })));
  const bulkResponse = await request('/api/datasets/' + dataset.id + '/versions', 'POST', { ...payload, key: randomUUID(), content: bulkContent }, a.cookie);
  assert.equal(bulkResponse.status, 201); const bulk = await bulkResponse.json(), wall: number[] = [], engine: number[] = [];
  for (let i = 0; i < 10; i++) {
    const began = performance.now(), queued = await enqueue(bulk.id, a.cookie), result = await waitForJob(queued.id, a.cookie);
    wall.push(performance.now() - began); engine.push(result.report.resources.durationMs);
  }
  const summarize = (values: number[]) => { const ordered = [...values].sort((a, b) => a - b); return { samples: values.length,
    p50Ms: ordered[Math.ceil(values.length * 0.5) - 1], p95Ms: ordered[Math.ceil(values.length * 0.95) - 1], maximumMs: ordered.at(-1) }; };
  const performanceReport = { metadata: summarize(metadata), boundedJobs: summarize(wall), engine: summarize(engine),
    workload: { entries: 5000, formGraphemes: 96, referenceLanguages: 6, concepts: 8 }, metadataWarmupRequests: 10,
    verifierMaximumRssKiB: process.resourceUsage().maxRSS, cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, totalMemoryGiB: os.totalmem() / 1024 ** 3,
    limitations: ['Local loopback on one Windows host, warmed metadata and filesystem caches. No physical cold-disk or power-loss test.',
      'API and client timing run in the verifier process. Reported RSS excludes PostgreSQL and restic child processes.',
      'End-to-end job timing includes queue scheduling and 100 ms polling resolution. Small samples are not a service-level guarantee.'] };
  assert(performanceReport.metadata.p95Ms < 500); assert(performanceReport.boundedJobs.p95Ms < 60000);
  checks.push('Cached metadata meets the 500 ms p95 target and ten declared 5,000-row jobs meet the 60-second target');
  await writeFile(path.join(output, 'verification.json'), JSON.stringify({ version: 'atlas-recovery-performance-1', checkedAt: new Date().toISOString(),
    checks, snapshot, restored, latestSelection: { priorSnapshot: priorSnapshot.snapshotId, selectedSnapshot: latestSnapshot },
    performance: performanceReport, initialFreeGiB: before.bavail * before.bsize / 1024 ** 3,
    elapsedMs: performance.now() - started, passed: true }, null, 2));
  console.log(JSON.stringify({ checks, snapshot, restored, performance: performanceReport, passed: true }, null, 2));
} finally { await fixture.cleanup(); }
