import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AtlasConfig } from './config.js';
import { atlasPool } from './db.js';
import { migrate } from './migrate.js';
import { ingestReferences } from './references.js';
import { createApp } from './app.js';

/** Reproducible service fixture. Its bounded generated namespace never targets the personal database. */
export async function testFixture(config: AtlasConfig, compiled = false) {
  if (!config.adminDatabaseUrl) throw new Error('A disposable database requires the setup connection');
  const database = 'xeno_atlas_test_' + randomBytes(6).toString('hex');
  const location = path.join(config.root, 'temp', database), objects = path.join(location, 'objects');
  await mkdir(objects, { recursive: true });
  const connection = (value: string, schema?: string) => {
    const url = new URL(value); url.pathname = '/' + database;
    if (schema) url.searchParams.set('options', '-c search_path=' + schema + ',pg_catalog'); return url.toString();
  };
  const admin = atlasPool(config.adminDatabaseUrl, 1, 120000), server = createServer();
  let runtime: ReturnType<typeof createApp> | undefined;
  let cleaned = false;
  const testConfig = { ...config, objects, databaseUrl: connection(config.databaseUrl), authDatabaseUrl: connection(config.authDatabaseUrl, 'auth'),
    workerDatabaseUrl: connection(config.workerDatabaseUrl), adminDatabaseUrl: connection(config.adminDatabaseUrl) };
  const stop = async () => {
    runtime?.drain(); server.closeAllConnections(); await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
    if (runtime) { await runtime.close(); runtime = undefined; }
  };
  const cleanup = async () => {
    if (cleaned) return;
    await stop();
    if (!/^xeno_atlas_test_[a-f0-9]{12}$/.test(database)) throw new Error('Invalid disposable database name');
    await admin.query('DROP DATABASE IF EXISTS "' + database + '" WITH (FORCE)'); await admin.end();
    const resolved = await realpath(location);
    if (resolved !== path.join(config.root, 'temp', database) || !resolved.startsWith(path.join(config.root, 'temp') + path.sep)) throw new Error('Unsafe fixture cleanup path');
    await rm(resolved, { recursive: true, force: true });
    cleaned = true;
  };
  try {
    await admin.query('CREATE DATABASE "' + database + '" OWNER atlas_owner TEMPLATE template0');
    const setup = atlasPool(testConfig.adminDatabaseUrl, 1, 120000);
    try { await setup.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC;
      GRANT CONNECT ON DATABASE "${database}" TO atlas_app,atlas_auth,atlas_worker;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      CREATE SCHEMA atlas AUTHORIZATION atlas_owner; CREATE SCHEMA auth AUTHORIZATION atlas_auth;`); }
    finally { await setup.end(); }
    await migrate(testConfig); await ingestReferences(testConfig);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture listener unavailable');
    testConfig.origin = 'http://127.0.0.1:' + address.port;
    const factory = compiled ? (await import(pathToFileURL(path.join(config.source, 'cloud/dist/app.mjs')).href)).createApp as typeof createApp : createApp;
    runtime = factory(testConfig); server.on('request', runtime.app); await runtime.start();
    return { config: testConfig, runtime, database, location, stop, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
