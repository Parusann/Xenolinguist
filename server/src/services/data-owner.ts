import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProfileError } from '../../../shared/schemas/errors.js';

function isAlive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}

export async function acquireDataOwner(directory: string): Promise<() => Promise<void>> {
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, '.owner.lock');
  const token = randomUUID();
  const claim = async () => {
    const handle = await fs.open(file, 'wx');
    try { await handle.writeFile(JSON.stringify({ pid: process.pid, token })); await handle.sync(); }
    finally { await handle.close(); }
  };
  try { await claim(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const recoveryFile = path.join(directory, '.owner-recovery.lock');
    let recovery;
    try { recovery = await fs.open(recoveryFile, 'wx'); }
    catch { throw new ProfileError('DATA_OWNER_RECOVERY_BUSY', 'Data-directory ownership needs recovery; another recovery may be running', 503); }
    try {
      let owner: { pid?: number; token?: string };
      try { owner = JSON.parse(await fs.readFile(file, 'utf8')); }
      catch { throw new ProfileError('DATA_OWNER_UNKNOWN', 'Cannot identify the existing data-directory owner; preserve the lock for inspection', 503); }
      if (!Number.isInteger(owner.pid) || owner.pid! <= 0 || typeof owner.token !== 'string' || isAlive(owner.pid!))
        throw new ProfileError('DATA_DIRECTORY_IN_USE', 'Another backend owns this data directory', 503);
      // Recovery contenders serialize and re-read the current owner before removing a dead process lock.
      await fs.unlink(file);
      await claim();
    } finally { await recovery.close(); await fs.unlink(recoveryFile); }
  }
  return async () => {
    try {
      const owner = JSON.parse(await fs.readFile(file, 'utf8'));
      if (owner.token === token) await fs.unlink(file);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  };
}
