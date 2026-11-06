import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
import { atlasPool, asOwner, lockObjects } from './db.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';
import { comparisonReferences, ingestReferences } from './references.js';
import { compareLanguages } from '../../engine/src/comparison/compare.js';
import { AtlasWorker } from './worker/runner.js';
import { compute, ComputeError } from './worker/compute.js';

const config = await loadConfig();
if (!config.adminDatabaseUrl) throw new Error('Verification requires the administrative setup environment');
const suffix = randomBytes(6).toString('hex'), database = 'xeno_atlas_test_' + suffix;
if (!/^xeno_atlas_test_[a-f0-9]{12}$/.test(database)) throw new Error('Invalid disposable database name');
const location = path.join(config.root, 'temp', database), objects = path.join(location, 'objects');
await mkdir(objects, { recursive: true });
const connection = (value: string, schema?: string) => {
  const url = new URL(value); url.pathname = '/' + database;
  if (schema) url.searchParams.set('options', '-c search_path=' + schema + ',pg_catalog');
  return url.toString();
};
const admin = atlasPool(config.adminDatabaseUrl, 1, 120000), checks: string[] = [];
let fixture: ReturnType<typeof createApp> | undefined;
let tenantPool: ReturnType<typeof atlasPool> | undefined;
const server = createServer();
const report: Record<string, unknown> = { version: 'atlas-foundation-verification-1', checkedAt: new Date().toISOString(), checks };
try {
  await admin.query('CREATE DATABASE "' + database + '" OWNER atlas_owner TEMPLATE template0');
  const testConfig = { ...config, objects, databaseUrl: connection(config.databaseUrl), authDatabaseUrl: connection(config.authDatabaseUrl, 'auth'),
    workerDatabaseUrl: connection(config.workerDatabaseUrl), adminDatabaseUrl: connection(config.adminDatabaseUrl) };
  const bootstrap = atlasPool(testConfig.adminDatabaseUrl, 1);
  try {
    await bootstrap.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC;
      GRANT CONNECT ON DATABASE "${database}" TO atlas_app,atlas_auth,atlas_worker;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      CREATE SCHEMA atlas AUTHORIZATION atlas_owner; CREATE SCHEMA auth AUTHORIZATION atlas_auth;`);
  } finally { await bootstrap.end(); }
  await migrate(testConfig);
  await migrate(testConfig);
  checks.push('Migrations replay from empty and rerun without changes');
  const firstReference = await ingestReferences(testConfig), repeatedReference = await ingestReferences(testConfig);
  assert.equal(firstReference.forms, 70);
  assert.equal(firstReference.languages, 6);
  assert.equal(firstReference.alreadyPresent, false);
  assert.equal(repeatedReference.alreadyPresent, true);
  assert.equal(firstReference.sha256, repeatedReference.sha256);
  assert.equal(firstReference.structural.features, 12);
  assert.equal(repeatedReference.structural.alreadyPresent, true);
  checks.push('Licensed reference ingestion is byte-verified and idempotent');
  const inspector = atlasPool(testConfig.adminDatabaseUrl, 1);
  try {
    const journal = (await inspector.query("SELECT sha256 FROM atlas.schema_migrations WHERE name='002-atlas.sql'")).rows[0].sha256;
    await inspector.query("UPDATE atlas.schema_migrations SET sha256=$1 WHERE name='002-atlas.sql'", ['0'.repeat(64)]);
    await assert.rejects(migrate(testConfig), /applied migration has changed/);
    await inspector.query("UPDATE atlas.schema_migrations SET sha256=$1 WHERE name='002-atlas.sql'", [journal]);
  } finally { await inspector.end(); }
  checks.push('Changed applied migrations are rejected');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing verification listener');
  const origin = 'http://127.0.0.1:' + address.port;
  fixture = createApp({ ...testConfig, origin });
  server.on('request', fixture.app);
  const request = async (route: string, method = 'GET', body?: unknown, cookie?: string) => {
    const response = await fetch(origin + route, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return response;
  };
  assert.equal((await request('/api/datasets')).status, 401);
  checks.push('Anonymous dataset access is rejected');
  const account = async (name: string) => {
    const response = await request('/api/auth/sign-up/email', 'POST', { name, email: name + suffix + '@example.invalid',
      password: randomBytes(24).toString('hex') });
    assert.equal(response.status, 200, 'Account creation must work through the HTTP handler');
    const data = await response.json();
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert(cookie.includes('xeno-atlas'));
    return { id: data.user.id as string, cookie };
  };
  const a = await account('fixture-a'), b = await account('fixture-b');
  checks.push('Two accounts receive independently signed sessions');
  const references = await (await request('/api/references', 'GET', undefined, a.cookie)).json();
  assert.equal(references.length, 2);
  assert.equal(references.find((source: { id: string }) => source.id === 'wold-pilot-4.2').forms, 70);
  assert(references.every((source: { license: string }) => source.license === 'CC-BY-4.0'));
  assert(references.some((source: { attribution: string }) => source.attribution.includes('Anthony Grant')));
  checks.push('Reference retrieval preserves its source license and vocabulary attribution');
  const referencePool = atlasPool(testConfig.databaseUrl, 1);
  try {
    const catalog = await comparisonReferences(referencePool);
    assert.equal(catalog.length, 6);
    const english = catalog.find(language => language.id === 'English')!;
    assert.equal(english.features.word_order.value, 'SVO');
    assert.deepEqual(catalog.find(language => language.id === 'MandarinChinese')!.features, {});
    const comparison = compareLanguages({ versionId: 'verification', objectSha256: '0'.repeat(64), features: {},
      entries: english.entries.slice(0, 8).map(entry => ({ id: 'query-' + entry.id, form: entry.form, meaning: entry.meaning })) }, catalog);
    assert.equal(comparison.matches[0].languageId, 'English');
    assert.equal(comparison.referenceSources.length, 2);
    checks.push('Stored vocabulary and uniquely matched grammar produce a source-pinned comparison');
  } finally { await referencePool.end(); }
  const forgedCookie = a.cookie.replace(/(xeno-atlas\.session_token=)([^;]+)/, (_match, prefix, value: string) =>
    prefix + value.slice(0, -1) + (value.endsWith('a') ? 'b' : 'a'));
  assert.notEqual(forgedCookie, a.cookie);
  assert.equal((await request('/api/datasets', 'GET', undefined, forgedCookie)).status, 401);
  checks.push('A modified session signature is rejected');
  const create = await request('/api/datasets', 'POST', { title: 'Synthetic isolation fixture', languageKind: 'synthetic' }, a.cookie);
  assert.equal(create.status, 201);
  const dataset = await create.json();
  assert.equal(dataset.owner_id, a.id);
  assert.deepEqual(await (await request('/api/datasets', 'GET', undefined, b.cookie)).json(), []);
  assert.equal((await request('/api/datasets/' + dataset.id, 'GET', undefined, b.cookie)).status, 404);
  assert.equal((await request('/api/datasets', 'POST', { title: 'Forged owner', languageKind: 'synthetic', owner_id: b.id }, a.cookie)).status, 400);
  checks.push('HTTP ownership comes from the session and cross-account reads fail');
  const content = 'id,form,meaning,transcription,annotations\na,ka,sun,k a,synthetic\nb,e\u0301,water,eː,original spelling\n';
  const upload = { key: randomUUID(), format: 'csv', content, metadata: { rights: { license: 'Synthetic test fixture', creator: 'Test fixture' } } };
  const uploadPath = '/api/datasets/' + dataset.id + '/versions';
  const response = await request(uploadPath, 'POST', upload, a.cookie);
  assert.equal(response.status, 201);
  const version = await response.json();
  assert.equal(version.row_count, 2);
  const repeated = await Promise.all(Array.from({ length: 3 }, async () => {
    const response = await request(uploadPath, 'POST', upload, a.cookie);
    assert.equal(response.status, 201);
    return (await response.json()).id;
  }));
  assert(repeated.every(id => id === version.id));
  assert.equal((await request(uploadPath, 'POST', { ...upload, content: content + 'c,ta,moon,,test\n' }, a.cookie)).status, 409);
  checks.push('Concurrent identical uploads publish one version and changed retries fail');
  for (const [format, content] of [['json', '[{"id":"j1","form":"tu","meaning":"moon"}]'], ['text', 'First synthetic sample\nSecond synthetic sample\n']]) {
    const response = await request(uploadPath, 'POST', { ...upload, key: randomUUID(), format, content }, a.cookie);
    assert.equal(response.status, 201);
    const saved = await response.json();
    assert.notEqual(saved.id, version.id);
    assert.equal(await (await request('/api/versions/' + saved.id + '/download', 'GET', undefined, a.cookie)).text(), content);
  }
  checks.push('CSV, JSON and text uploads create separate immutable versions');
  const entries = await (await request('/api/versions/' + version.id + '/entries', 'GET', undefined, a.cookie)).json();
  assert.equal(entries[1].form, 'é');
  assert.equal(entries[1].original_form, 'e\u0301');
  assert.equal(entries[0].transcription, 'k a');
  assert.equal(await (await request('/api/versions/' + version.id + '/download', 'GET', undefined, a.cookie)).text(), content);
  assert.equal((await request('/api/versions/' + version.id + '/download', 'GET', undefined, b.cookie)).status, 404);
  checks.push('Original UTF-8 bytes survive upload and only the owner can download them');
  const enqueuePath = '/api/versions/' + version.id + '/jobs', jobKey = randomUUID();
  const enqueued = await Promise.all(Array.from({ length: 3 }, async () => {
    const result = await request(enqueuePath, 'POST', { key: jobKey }, a.cookie);
    assert.equal(result.status, 202); return result.json();
  }));
  assert(enqueued.every(job => job.id === enqueued[0].id));
  assert.equal((await request('/api/jobs/' + enqueued[0].id, 'GET', undefined, b.cookie)).status, 404);
  assert.equal((await request('/api/jobs/' + enqueued[0].id + '/cancel', 'POST', {}, b.cookie)).status, 404);
  checks.push('Comparison requests are idempotent and isolated from other accounts');
  const claimed = (await Promise.all([fixture.worker.claim(), fixture.worker.claim()])).filter(Boolean);
  assert.equal(claimed.length, 1);
  const abandoned = claimed[0]!;
  const queueInspector = atlasPool(testConfig.adminDatabaseUrl, 1);
  try {
    await queueInspector.query("UPDATE atlas.jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [abandoned.id]);
    const recovered = (await fixture.worker.claim())!;
    assert.equal(recovered.id, abandoned.id); assert.equal(recovered.attempts, 2);
    assert.notEqual(recovered.lease_token, abandoned.lease_token);
    const snapshot = await fixture.worker.input(abandoned);
    const refs = await comparisonReferences(fixture.worker.pool);
    await assert.rejects(compute(snapshot.input, refs, new AbortController().signal, 1),
      error => error instanceof ComputeError && error.code === 'timeout');
    checks.push('The external computation deadline terminates a worker and returns a bounded timeout');
    assert.equal(await fixture.worker.publish(abandoned, compareLanguages(snapshot.input, refs)), false);
    await fixture.worker.perform(recovered);
    const completed = await (await request('/api/jobs/' + recovered.id, 'GET', undefined, a.cookie)).json();
    assert.equal(completed.status, 'complete', JSON.stringify(completed));
    assert.equal(completed.report.input.objectSha256, createHash('sha256').update(content).digest('hex'));
    assert.equal((await request('/api/jobs/' + recovered.id + '/report', 'GET', undefined, b.cookie)).status, 404);
    assert.equal((await request('/api/jobs/' + recovered.id + '/report', 'GET', undefined, a.cookie)).status, 200);
    checks.push('Expired work is reclaimed once and a stale lease cannot publish over its replacement');
    const cancelling = await fixture.jobs.create(a.id, version.id, { key: randomUUID() });
    const cancelledClaim = (await fixture.worker.claim())!;
    assert.equal(cancelledClaim.id, cancelling.id);
    assert.equal((await request('/api/jobs/' + cancelling.id + '/cancel', 'POST', {}, a.cookie)).status, 200);
    await fixture.worker.perform(cancelledClaim);
    assert.equal((await fixture.jobs.detail(a.id, cancelling.id)).status, 'cancelled');
    checks.push('Cancellation fences an already claimed computation and prevents report publication');
    const exhausted = await fixture.jobs.create(a.id, version.id, { key: randomUUID() });
    await fixture.worker.claim();
    await queueInspector.query("UPDATE atlas.jobs SET attempts=3,lease_until=now()-interval '1 second' WHERE id=$1", [exhausted.id]);
    assert.equal(await fixture.worker.claim(), undefined);
    assert.equal((await fixture.jobs.detail(a.id, exhausted.id)).error_code, 'attempt-limit');
    checks.push('Three interrupted attempts reach a terminal state instead of retrying forever');
    const deleting = await fixture.datasets.create(a.id, { title: 'Permission revocation fixture', languageKind: 'synthetic' });
    const deletingVersion = await fixture.datasets.upload(a.id, deleting.id, { ...upload, key: randomUUID() });
    const deletingJob = await fixture.jobs.create(a.id, deletingVersion.id, { key: randomUUID() });
    const deletedClaim = (await fixture.worker.claim())!;
    await fixture.datasets.remove(a.id, deleting.id);
    await fixture.worker.perform(deletedClaim);
    await assert.rejects(fixture.jobs.detail(a.id, deletingJob.id));
    checks.push('Deleted input revokes queued and claimed work before a result can be disclosed');
    const orphan = await fixture.datasets.objects.put(Buffer.from('Reproducible orphan fixture'));
    const partialId = randomUUID(), partial = path.join(objects, partialId + '.partial');
    await writeFile(partial, 'Reproducible interrupted upload');
    const old = new Date(Date.now() - 2 * 3600000); await utimes(partial, old, old);
    assert.equal(await fixture.worker.cleanupOrphans(), 1);
    assert.equal((await fixture.datasets.objects.inventory()).some(file => file.id === orphan.id), true);
    await utimes(path.join(objects, orphan.id + '.blob'), old, old);
    const publishing = await fixture.worker.pool.connect();
    try {
      await publishing.query('BEGIN'); await lockObjects(publishing);
      await assert.rejects(fixture.worker.cleanupOrphans(), error => (error as { code?: string }).code === '55P03');
      assert.equal((await fixture.datasets.objects.inventory()).some(file => file.id === orphan.id), true);
    } finally { await publishing.query('ROLLBACK'); publishing.release(); }
    assert.equal(await fixture.worker.cleanupOrphans(), 1);
    checks.push('Orphan cleanup retains recent files and waits for in-flight upload publication');
  } finally { await queueInspector.end(); }
  assert.equal((await request('/api/auth/sign-out', 'POST', {}, b.cookie)).status, 200);
  assert.equal((await request('/api/datasets', 'GET', undefined, b.cookie)).status, 401);
  checks.push('Signing out revokes the stored session');
  const objectFile = path.join(objects, version.object_id + '.blob');
  const bytes = await readFile(objectFile), corrupt = Buffer.from(bytes); corrupt[0] ^= 1;
  await writeFile(objectFile, corrupt);
  assert.equal((await request('/api/versions/' + version.id + '/download', 'GET', undefined, a.cookie)).status, 409);
  await writeFile(objectFile, bytes);
  checks.push('A changed stored byte is rejected by the download integrity check');
  assert.equal((await request(uploadPath, 'POST', { ...upload, key: randomUUID(), content: 'id,form\na,ka\na,ta\n' }, a.cookie)).status, 400);
  const tooMany = JSON.stringify(Array.from({ length: 5001 }, (_, i) => ({ id: 'r' + i, form: 'ka' })));
  assert.equal((await request(uploadPath, 'POST', { ...upload, key: randomUUID(), format: 'json', content: tooMany }, a.cookie)).status, 400);
  assert.equal((await request(uploadPath, 'POST', { ...upload, key: randomUUID(), content: 'a'.repeat(5 * 1024 * 1024 + 1) }, a.cookie)).status, 400);
  assert.equal((await request('/api/versions/%2e%2e%2foutside/download', 'GET', undefined, a.cookie)).status, 400);
  const outside = Buffer.from('Synthetic path-escape fixture');
  await writeFile(path.join(location, 'outside.blob'), outside);
  await assert.rejects(fixture.datasets.objects.read('../outside', {
    sha256: createHash('sha256').update(outside).digest('hex'), bytes: outside.length,
  }));
  checks.push('Duplicate entry identifiers and invalid object paths fail validation');
  tenantPool = atlasPool(testConfig.databaseUrl, 1);
  const count = async () => Number((await tenantPool!.query('SELECT count(*) AS n FROM atlas.datasets')).rows[0].n);
  assert.equal(await asOwner(tenantPool, a.id, async client => Number((await client.query('SELECT count(*) AS n FROM atlas.datasets')).rows[0].n)), 1);
  assert.equal(await asOwner(tenantPool, b.id, async client => Number((await client.query('SELECT count(*) AS n FROM atlas.datasets')).rows[0].n)), 0);
  assert.equal(await count(), 0);
  await assert.rejects(asOwner(tenantPool, a.id, async () => { throw new Error('Synthetic rollback'); }));
  assert.equal(await count(), 0);
  checks.push('Forced RLS and transaction cleanup prevent pooled tenant-context leakage');
  const csrf = await fetch(origin + '/api/datasets', { method: 'POST', headers: { Cookie: a.cookie, Origin: 'https://invalid.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Invalid origin', languageKind: 'synthetic' }) });
  assert.equal(csrf.status, 403);
  checks.push('A foreign origin cannot mutate authenticated data');
  assert.equal((await request('/api/datasets/' + dataset.id, 'DELETE', undefined, a.cookie)).status, 200);
  assert.equal((await request('/api/versions/' + version.id + '/download', 'GET', undefined, a.cookie)).status, 404);
  checks.push('Deletion immediately revokes version and object disclosure');
  assert((await fixture.worker.cleanupPending()) >= 3);
  assert.equal((await fixture.datasets.objects.inventory()).length, 0);
  checks.push('Deferred cleanup removes deleted objects and is safe to run again');
  assert.equal(await fixture.worker.cleanupPending(), 0);
  await fixture.worker.start();
  await assert.rejects(new AtlasWorker(fixture.worker.pool, fixture.datasets.objects).start(), /Another atlas worker/);
  await fixture.worker.stop();
  checks.push('A second service cannot acquire leadership of the same worker queue');
  report.passed = true;
} finally {
  await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
  await fixture?.close();
  await tenantPool?.end();
  await admin.query('DROP DATABASE IF EXISTS "' + database + '" WITH (FORCE)');
  await admin.end();
  const resolved = await realpath(location);
  if (resolved !== path.join(config.root, 'temp', database) || !resolved.startsWith(path.join(config.root, 'temp') + path.sep))
    throw new Error('Refusing cleanup outside the disposable fixture directory');
  await rm(resolved, { recursive: true, force: true });
}
const target = process.argv[2];
if (!target || !path.resolve(target).startsWith(config.root + path.sep)) throw new Error('Verification output must use the research workspace');
await writeFile(target, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
