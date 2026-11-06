import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
import { atlasPool, asOwner } from './db.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';

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
  const content = 'id,form,meaning,annotations\na,ka,sun,synthetic\nb,e\u0301,water,original spelling\n';
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
  assert.equal((await request(uploadPath, 'POST', { ...upload, content: content + 'c,ta,moon,test\n' }, a.cookie)).status, 409);
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
  assert.equal(await (await request('/api/versions/' + version.id + '/download', 'GET', undefined, a.cookie)).text(), content);
  assert.equal((await request('/api/versions/' + version.id + '/download', 'GET', undefined, b.cookie)).status, 404);
  checks.push('Original UTF-8 bytes survive upload and only the owner can download them');
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
