import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.CI !== 'true' || process.platform !== 'linux' || !process.env.GITHUB_ENV)
  throw new Error('This bootstrap is limited to the disposable Linux Actions runner');
const source = await realpath(fileURLToPath(new URL('..', import.meta.url))), root = path.dirname(source);
await mkdir(path.join(root, 'config'), { recursive: true });
await mkdir(path.join(root, 'data/atlas/objects'), { recursive: true });
await writeFile(path.join(root, 'config/research-workspace.json'), JSON.stringify({ project: 'xenolinguist-research', root, source, ephemeral: true }), { flag: 'wx' });
const admin = process.env.ATLAS_ADMIN_DATABASE_URL;
if (!admin || new URL(admin).hostname !== '127.0.0.1') throw new Error('Expected the disposable loopback database');
const pool = new Pool({ connectionString: admin }), values = { XENO_RESEARCH_ROOT: root, NODE_ENV: 'production',
  ATLAS_AUTH_SECRET: randomBytes(32).toString('hex'), ATLAS_CONTROL_TOKEN: randomBytes(32).toString('hex') };
try {
  await pool.query('CREATE ROLE atlas_owner NOLOGIN NOSUPERUSER NOBYPASSRLS');
  for (const [name, key] of [['atlas_app', 'ATLAS_DATABASE_URL'], ['atlas_auth', 'ATLAS_AUTH_DATABASE_URL'], ['atlas_worker', 'ATLAS_WORKER_DATABASE_URL']]) {
    const password = randomBytes(32).toString('hex');
    console.log('::add-mask::' + password);
    await pool.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    const url = new URL(admin); url.username = name; url.password = password; values[key] = url.toString();
  }
  await pool.query(`REVOKE ALL ON DATABASE xenolinguist_atlas FROM PUBLIC;
    GRANT CONNECT ON DATABASE xenolinguist_atlas TO atlas_app,atlas_auth,atlas_worker;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    CREATE SCHEMA atlas AUTHORIZATION atlas_owner; CREATE SCHEMA auth AUTHORIZATION atlas_auth;
    ALTER ROLE atlas_auth IN DATABASE xenolinguist_atlas SET search_path=auth,pg_catalog;
    ALTER ROLE atlas_app IN DATABASE xenolinguist_atlas SET search_path=atlas,pg_catalog;
    ALTER ROLE atlas_worker IN DATABASE xenolinguist_atlas SET search_path=atlas,pg_catalog;`);
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith('ATLAS_')) console.log('::add-mask::' + value);
    await appendFile(process.env.GITHUB_ENV, key + '=' + value + '\n');
  }
} finally { await pool.end(); }
