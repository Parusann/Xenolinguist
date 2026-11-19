import path from 'node:path';
import { readFile, realpath, lstat } from 'node:fs/promises';

export type AtlasConfig = {
  root: string;
  source: string;
  objects: string;
  databaseUrl: string;
  authDatabaseUrl: string;
  workerDatabaseUrl: string;
  adminDatabaseUrl?: string;
  authSecret: string;
  controlToken: string;
  origin: string;
};

export async function loadConfig(): Promise<AtlasConfig> {
  const root = process.env.XENO_RESEARCH_ROOT;
  if (!root || root !== await realpath(root)) throw new Error('Expected the configured research workspace');
  const marker = JSON.parse(await readFile(path.join(root, 'config/research-workspace.json'), 'utf8'));
  if (marker.project !== 'xenolinguist-research' || path.resolve(marker.root) !== root)
    throw new Error('Research workspace identity differs');
  if (process.platform === 'win32' && path.parse(root).root.toLowerCase() === (process.env.SystemDrive + '\\').toLowerCase())
    throw new Error('Atlas storage requires the configured data drive');
  const objects = path.join(root, 'data/atlas/objects');
  if ((await lstat(objects)).isSymbolicLink() || await realpath(objects) !== objects)
    throw new Error('Atlas object directory must remain inside its configured root');
  const database = (key: string, user: string) => {
    const value = process.env[key];
    if (!value) throw new Error('Missing atlas database configuration');
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
        url.port !== '5438' || url.pathname !== '/xenolinguist_atlas' || url.username !== user || !url.password)
      throw new Error('Expected the local atlas database and limited role');
    return value;
  };
  const authSecret = process.env.ATLAS_AUTH_SECRET;
  if (!authSecret || authSecret.length < 32) throw new Error('Missing atlas authentication secret');
  const controlToken = process.env.ATLAS_CONTROL_TOKEN;
  if (!controlToken || !/^[a-f0-9]{64}$/.test(controlToken)) throw new Error('Missing local control credential');
  const source = await realpath(marker.source);
  if (!source.startsWith(root + path.sep)) throw new Error('Atlas source must use the configured research drive');
  return { root, source, objects, databaseUrl: database('ATLAS_DATABASE_URL', 'atlas_app'),
    authDatabaseUrl: database('ATLAS_AUTH_DATABASE_URL', 'atlas_auth'), workerDatabaseUrl: database('ATLAS_WORKER_DATABASE_URL', 'atlas_worker'),
    ...(process.env.ATLAS_ADMIN_DATABASE_URL ? { adminDatabaseUrl: database('ATLAS_ADMIN_DATABASE_URL', 'atlas_admin') } : {}),
    authSecret, controlToken, origin: 'http://127.0.0.1:4318' };
}
