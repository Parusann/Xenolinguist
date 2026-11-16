import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rm, statfs } from 'node:fs/promises';
import path from 'node:path';
import type { PoolClient } from 'pg';
import type { AtlasConfig } from './config.js';
import { asOwner, atlasPool, dropDisposableDatabase } from './db.js';
import { ObjectStore } from './objects.js';
import { comparisonReferences } from './references.js';
import { compareLanguages } from '../../engine/src/comparison/compare.js';
import type { ComparisonReport } from '../../shared/schemas/atlas-comparison.js';

type Fingerprint = { rows: number; sha256: string };
type Manifest = { version: 'atlas-snapshot-1'; id: string; createdAt: string; database: string; postgres: string;
  tables: Record<string, Fingerprint>; objects: { id: string; sha256: string; bytes: number }[]; dumpSha256: string };
type Options = { password: string; directory?: string };
async function fileDigest(file: string) { const digest = createHash('sha256'); for await (const bytes of createReadStream(file)) digest.update(bytes); return digest.digest('hex'); }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

async function guarded(config: AtlasConfig, location: string, create = false) {
  const target = path.resolve(location);
  if (!target.startsWith(config.root + path.sep)) throw new Error('Recovery paths must remain on the research workspace');
  let cursor = target;
  while (true) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Recovery paths cannot use links'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  if (create) await mkdir(target, { recursive: true, mode: 0o700 });
  if (await realpath(target) !== target) throw new Error('Recovery directory moved');
  return target;
}
async function removeTemporary(config: AtlasConfig, root: string, directory: string) {
  const resolved = await guarded(config, directory);
  if (!resolved.startsWith(root + path.sep) || !/^(stage|restore)-[a-f0-9-]{36}$/u.test(path.basename(resolved))) throw new Error('Unsafe recovery cleanup');
  await rm(resolved, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
}
async function durable(file: string, bytes: Uint8Array) {
  const handle = await open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
function toolEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string' &&
    !entry[0].startsWith('ATLAS_') && !['PGPASSWORD', 'RESTIC_PASSWORD'].includes(entry[0])));
}
async function run(executable: string, args: string[], env: Record<string, string>, timeoutMs = 300000) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = '', oversized = false;
    const timeout = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', bytes => { if (output.length < 8 * 1024 * 1024) output += bytes.toString(); else { oversized = true; child.kill(); } });
    child.stderr.on('data', bytes => { error = (error + bytes.toString()).slice(-4096); });
    child.once('error', failure => { clearTimeout(timeout); reject(failure); });
    child.once('close', code => { clearTimeout(timeout); if (code === 0 && !oversized) resolve(output); else reject(new Error(path.basename(executable) + ' failed: ' + error.slice(-1000))); });
  });
}
function postgresEnvironment(url: string) {
  const value = new URL(url);
  return { ...toolEnvironment(), PGHOST: value.hostname, PGPORT: value.port, PGUSER: value.username,
    PGPASSWORD: decodeURIComponent(value.password), PGDATABASE: value.pathname.slice(1), PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8' };
}
function databaseUrl(value: string, name: string) { const url = new URL(value); url.pathname = '/' + name; return url.toString(); }
async function tableFingerprints(client: PoolClient) {
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  const tables = (await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('atlas','auth') ORDER BY schemaname,tablename")).rows;
  const result: Record<string, Fingerprint> = {};
  for (const table of tables) {
    if (!/^[a-z_]+$/u.test(table.schemaname) || !/^[a-z_]+$/u.test(table.tablename)) throw new Error('Unexpected recovery table identifier');
    const rowHash = "encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')";
    const row = (await client.query(`SELECT count(*)::int AS rows,
      encode(sha256(convert_to(coalesce(string_agg(${rowHash},'' ORDER BY ${rowHash}),''),'UTF8')),'hex') AS sha256
      FROM "${table.schemaname}"."${table.tablename}" t`)).rows[0];
    result[table.schemaname + '.' + table.tablename] = row;
  }
  return result;
}

class RecoveryTools {
  readonly directory: string;
  readonly repository: string;
  readonly postgres: string;
  readonly restic: string;
  readonly env: Record<string, string>;
  constructor(readonly config: AtlasConfig, options: Options) {
    if (!config.adminDatabaseUrl || options.password.length < 32) throw new Error('Recovery requires the local setup connection and repository password');
    this.directory = path.resolve(options.directory ?? path.join(config.root, 'data/atlas-backups'));
    this.repository = path.join(this.directory, 'repository');
    this.postgres = path.join(config.root, 'runtime/postgres/pgsql/bin');
    this.restic = path.join(config.root, 'runtime/restic/restic.exe');
    this.env = { ...toolEnvironment(), RESTIC_REPOSITORY: this.repository, RESTIC_PASSWORD: options.password,
      RESTIC_CACHE_DIR: path.join(config.root, 'cache/restic') };
  }
  async ready() {
    await guarded(this.config, this.directory, true); await guarded(this.config, this.repository, true);
    const version = await run(this.restic, ['version'], toolEnvironment());
    if (!version.startsWith('restic 0.19.1 ')) throw new Error('Recovery runtime differs from the pinned version');
  }
  command(args: string[]) { return run(this.restic, args, this.env); }
}

export async function latestBackup(config: AtlasConfig, options: Options) {
  const tools = new RecoveryTools(config, options); await tools.ready();
  // restic --latest groups by host AND path; our unique staging paths would return one result per backup.
  const snapshots: unknown = JSON.parse(await tools.command(['snapshots', '--json', '--tag', 'xenolinguist-atlas-1']));
  if (!Array.isArray(snapshots) || !snapshots.length) throw new Error('No Atlas recovery snapshot is available');
  const candidates = snapshots.map((snapshot: unknown) => {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('Invalid recovery snapshot listing');
    const { id, time } = snapshot as { id?: unknown; time?: unknown };
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/u.test(id) || typeof time !== 'string' || !Number.isFinite(Date.parse(time)))
      throw new Error('Invalid recovery snapshot listing');
    return { id, time: Date.parse(time) };
  });
  candidates.sort((a, b) => b.time - a.time || a.id.localeCompare(b.id));
  return candidates[0].id;
}

export async function createBackup(config: AtlasConfig, options: Options) {
  const tools = new RecoveryTools(config, options); await tools.ready();
  const pool = atlasPool(config.adminDatabaseUrl!, 1, 120000), client = await pool.connect();
  const stage = await guarded(config, path.join(tools.directory, 'stage-' + randomUUID()), true), stagedObjects = path.join(stage, 'objects');
  await mkdir(stagedObjects);
  const started = performance.now(); let manifest: Manifest;
  try {
    await client.query('SELECT pg_advisory_lock(43185442)');
    // Acquire the publication lock BEFORE opening the MVCC snapshot. An earlier snapshot could include a file already retired by GC.
    await client.query('SELECT pg_advisory_lock(43185440)');
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const objects = (await client.query('SELECT id,sha256,bytes FROM atlas.objects ORDER BY id')).rows as Manifest['objects'];
      const databaseBytes = Number((await client.query('SELECT pg_database_size(current_database()) AS bytes')).rows[0].bytes);
      const filesystem = await statfs(config.root), reserve = 20 * 1024 ** 3 + databaseBytes * 2 + objects.reduce((sum, object) => sum + object.bytes * 3, 0);
      if (filesystem.bavail * filesystem.bsize < reserve) throw new Error('Recovery staging would consume the reserved HDD headroom');
      const snapshot = (await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
      await run(path.join(tools.postgres, 'pg_dump.exe'), ['--format=custom', '--file=' + path.join(stage, 'atlas.dump'), '--snapshot=' + snapshot], postgresEnvironment(config.adminDatabaseUrl!));
      const store = new ObjectStore(config.objects);
      for (const object of objects) { if (!uuid.test(object.id)) throw new Error('Invalid backup object identifier');
        await durable(path.join(stagedObjects, object.id + '.blob'), await store.read(object.id, object)); }
      manifest = { version: 'atlas-snapshot-1', id: randomUUID(), createdAt: new Date().toISOString(), database: new URL(config.adminDatabaseUrl!).pathname.slice(1),
        postgres: (await client.query('SHOW server_version')).rows[0].server_version, tables: await tableFingerprints(client), objects,
        dumpSha256: await fileDigest(path.join(stage, 'atlas.dump')) };
      await durable(path.join(stage, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2)));
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { await client.query('SELECT pg_advisory_unlock(43185440)'); }
    const stagingMs = performance.now() - started;
    try { await lstat(path.join(tools.repository, 'config')); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await tools.command(['init']);
    }
    const lines = (await tools.command(['backup', stage, '--json', '--tag', 'xenolinguist-atlas-1'])).trim().split(/\r?\n/u).map(line => JSON.parse(line));
    const summary = lines.find(line => line.message_type === 'summary');
    if (!summary || !/^[a-f0-9]{64}$/u.test(summary.snapshot_id)) throw new Error('Recovery did not produce an identifiable snapshot');
    await removeTemporary(config, tools.directory, stage);
    return { snapshotId: summary.snapshot_id as string, createdAt: manifest.createdAt, tables: Object.keys(manifest.tables).length,
      objects: manifest.objects.length, stagingMs, totalMs: performance.now() - started, processedBytes: summary.total_bytes_processed as number };
  } finally {
    await client.query('SELECT pg_advisory_unlock(43185442)').catch(() => {}); client.release(); await pool.end();
  }
}

export async function verifyBackup(config: AtlasConfig, options: Options, snapshotId: string,
  inspect?: (restored: AtlasConfig) => Promise<void>) {
  if (!/^[a-f0-9]{64}$/u.test(snapshotId)) throw new Error('Use an exact recovery snapshot identifier');
  const tools = new RecoveryTools(config, options); await tools.ready();
  const started = performance.now(), target = await guarded(config, path.join(tools.directory, 'restore-' + randomUUID()), true);
  const database = 'xeno_atlas_restore_' + randomBytes(6).toString('hex'), admin = atlasPool(config.adminDatabaseUrl!, 1, 120000);
  let restoredPool: ReturnType<typeof atlasPool> | undefined, appPool: ReturnType<typeof atlasPool> | undefined, created = false;
  try {
    await tools.command(['check', '--read-data']);
    const listing = (await tools.command(['ls', '--json', snapshotId])).trim().split(/\r?\n/u).map(line => JSON.parse(line));
    const manifests = listing.filter(item => item.type === 'file' && typeof item.path === 'string' && path.posix.basename(item.path) === 'manifest.json');
    if (manifests.length !== 1) throw new Error('Recovery snapshot has an ambiguous manifest');
    const subtree = path.posix.dirname(manifests[0].path);
    if (!subtree.startsWith('/') || subtree.split('/').includes('..')) throw new Error('Unsafe recovery snapshot path');
    await tools.command(['restore', snapshotId + ':' + subtree, '--target', target, '--verify']);
    const manifest = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8')) as Manifest;
    if (manifest.version !== 'atlas-snapshot-1' || !uuid.test(manifest.id) || !Array.isArray(manifest.objects) || !manifest.tables || !/^[a-f0-9]{64}$/u.test(manifest.dumpSha256)) throw new Error('Invalid recovery manifest');
    assert.equal(await fileDigest(path.join(target, 'atlas.dump')), manifest.dumpSha256, 'Database dump checksum differs');
    const objects = await guarded(config, path.join(target, 'objects')), store = new ObjectStore(objects);
    for (const object of manifest.objects) { assert(uuid.test(object.id)); await store.read(object.id, object); }
    assert.equal((await store.inventory()).length, manifest.objects.length, 'Recovered object inventory differs');
    assert(/^xeno_atlas_restore_[a-f0-9]{12}$/u.test(database));
    await admin.query('CREATE DATABASE "' + database + '" OWNER atlas_owner TEMPLATE template0'); created = true;
    await admin.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC;
      GRANT CONNECT ON DATABASE "${database}" TO atlas_app,atlas_auth,atlas_worker;
      ALTER ROLE atlas_auth IN DATABASE "${database}" SET search_path=auth,pg_catalog;
      ALTER ROLE atlas_app IN DATABASE "${database}" SET search_path=atlas,pg_catalog;
      ALTER ROLE atlas_worker IN DATABASE "${database}" SET search_path=atlas,pg_catalog;`);
    const restored: AtlasConfig = { ...config, objects, databaseUrl: databaseUrl(config.databaseUrl, database),
      authDatabaseUrl: databaseUrl(config.authDatabaseUrl, database), workerDatabaseUrl: databaseUrl(config.workerDatabaseUrl, database), adminDatabaseUrl: databaseUrl(config.adminDatabaseUrl!, database) };
    await run(path.join(tools.postgres, 'pg_restore.exe'), ['--exit-on-error', '--dbname=' + database, path.join(target, 'atlas.dump')], postgresEnvironment(restored.adminDatabaseUrl!));
    restoredPool = atlasPool(restored.adminDatabaseUrl!, 1, 120000); const client = await restoredPool.connect();
    try { await client.query('BEGIN READ ONLY'); assert.deepEqual(await tableFingerprints(client), manifest.tables, 'Restored table contents differ'); await client.query('COMMIT'); }
    finally { client.release(); }
    appPool = atlasPool(restored.databaseUrl, 2);
    assert.equal(Number((await appPool.query('SELECT count(*) AS n FROM atlas.datasets')).rows[0].n), 0, 'Recovered RLS leaked an unscoped dataset');
    const owners = (await restoredPool.query('SELECT owner_id,count(*)::int AS n FROM atlas.datasets GROUP BY owner_id')).rows;
    for (const owner of owners) assert.equal(await asOwner(appPool, owner.owner_id, async connection => Number((await connection.query('SELECT count(*) AS n FROM atlas.datasets')).rows[0].n)), owner.n);
    const protectedTables = (await restoredPool.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='atlas' AND c.relname IN ('datasets','dataset_versions','entries','objects','jobs','consents')`)).rows;
    assert.equal(protectedTables.length, 6); assert(protectedTables.every(table => table.relrowsecurity && table.relforcerowsecurity));
    const references = await comparisonReferences(appPool);
    const reports = (await restoredPool.query("SELECT owner_id,version_id,report FROM atlas.jobs WHERE status='complete' ORDER BY id LIMIT 10")).rows;
    let replayed = 0;
    for (const job of reports) {
      const saved = job.report as ComparisonReport; if (saved.state !== 'complete') continue;
      const input = await asOwner(appPool, job.owner_id, async connection => {
        const version = (await connection.query('SELECT features FROM atlas.dataset_versions WHERE id=$1', [job.version_id])).rows[0];
        const entries = (await connection.query('SELECT entry_id AS id,form,meaning,transcription FROM atlas.entries WHERE version_id=$1 ORDER BY ordinal', [job.version_id])).rows;
        return { versionId: job.version_id, objectSha256: saved.input.objectSha256, entries, features: version.features };
      });
      const actual = compareLanguages(input, references), normalize = (report: ComparisonReport) => ({ ...report, resources: { ...report.resources, durationMs: 0 } });
      assert.deepEqual(normalize(actual), normalize(saved), 'Restored comparison does not replay'); replayed++;
    }
    if (inspect) await inspect(restored);
    return { snapshotId, verifiedAt: new Date().toISOString(), tables: Object.keys(manifest.tables).length, objects: manifest.objects.length,
      ownerScopes: owners.length, replayedReports: replayed, restoredAccounts: manifest.tables['auth.user']?.rows ?? 0,
      sourceDatabase: manifest.database, restoreMs: performance.now() - started, passed: true };
  } finally {
    await appPool?.end(); await restoredPool?.end();
    if (created) await dropDisposableDatabase(admin, database);
    await admin.end(); await removeTemporary(config, tools.directory, target);
  }
}
