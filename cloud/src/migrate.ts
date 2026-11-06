import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';
import { loadConfig, type AtlasConfig } from './config.js';
import { atlasPool } from './db.js';
import { createAuth } from './auth.js';

export async function generateAuthMigration(config: AtlasConfig) {
  const pool = atlasPool(config.authDatabaseUrl, 1);
  try {
    const plan = await getMigrations(createAuth(config, pool).options);
    if (plan.toBeAdded.length || plan.toBeCreated.length !== 4 || plan.unsafeChanges.length || plan.schemaProblems.length)
      throw new Error('Generate the initial authentication migration against an empty auth schema');
    await writeFile(path.join(config.source, 'cloud/migrations/001-auth.sql'), await plan.compileMigrations() + '\n', { flag: 'wx' });
  } finally { await pool.end(); }
}

export async function migrate(config: AtlasConfig) {
  if (!config.adminDatabaseUrl) throw new Error('Migrations require the local administrative connection');
  const pool = atlasPool(config.adminDatabaseUrl, 1, 120000);
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(43185438)');
    await client.query(`SET ROLE atlas_owner;
      CREATE TABLE IF NOT EXISTS atlas.schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
      RESET ROLE;`);
    for (const name of ['001-auth.sql', '002-atlas.sql', '003-reference-metadata.sql']) {
      const sql = (await readFile(path.join(config.source, 'cloud/migrations', name), 'utf8')).replaceAll('\r\n', '\n');
      const sha = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query('SELECT sha256 FROM atlas.schema_migrations WHERE name=$1', [name]);
      if (applied.rowCount) {
        if (applied.rows[0].sha256 !== sha) throw new Error('An applied migration has changed');
        continue;
      }
      await client.query('BEGIN');
      try {
        if (name === '001-auth.sql') {
          await client.query('SET LOCAL ROLE atlas_auth; SET LOCAL search_path=auth,pg_catalog');
        } else {
          await client.query('GRANT USAGE ON SCHEMA auth TO atlas_owner; GRANT REFERENCES ON auth."user" TO atlas_owner; SET LOCAL ROLE atlas_owner; SET LOCAL search_path=atlas,pg_catalog;');
        }
        await client.query(sql);
        await client.query('SET LOCAL ROLE atlas_owner');
        await client.query('INSERT INTO atlas.schema_migrations(name,sha256) VALUES($1,$2)', [name, sha]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(43185438)').catch(() => {});
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  loadConfig().then(config => process.argv[2] === '--generate-auth' ? generateAuthMigration(config) : migrate(config))
    .then(() => console.log('Atlas migrations verified.')).catch(error => {
      console.error(error instanceof Error ? error.message : 'Atlas migration failed');
      process.exitCode = 1;
    });
}
