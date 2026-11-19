import { lstat, open, readFile, realpath, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

type Record = { version: 'atlas-backup-status-1'; lastVerifiedAt: string | null; snapshotId: string | null;
  lastAttemptAt: string; lastAttemptSucceeded: boolean; sourceDatabase: 'xenolinguist_atlas' };
async function record(root: string): Promise<Record | null> {
  const file = path.join(root, 'config/atlas/backup-status.json');
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536 || await realpath(file) !== file) return null;
    const value = JSON.parse(await readFile(file, 'utf8'));
    return value.version === 'atlas-backup-status-1' && value.sourceDatabase === 'xenolinguist_atlas' ? value : null;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
}
export async function backupStatus(root: string) {
  const value = await record(root), verified = value?.lastVerifiedAt;
  return { lastVerifiedAt: verified ?? null, independent: false, stale: !verified || !Number.isFinite(Date.parse(verified)) || Date.now() - Date.parse(verified) > 7 * 86400000,
    lastAttemptSucceeded: value?.lastAttemptSucceeded ?? null };
}
export async function saveBackupStatus(root: string, result?: { verifiedAt: string; snapshotId: string }) {
  const previous = await record(root), directory = path.join(root, 'config/atlas');
  if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new Error('Invalid backup status directory');
  const value: Record = { version: 'atlas-backup-status-1', lastVerifiedAt: result?.verifiedAt ?? previous?.lastVerifiedAt ?? null,
    snapshotId: result?.snapshotId ?? previous?.snapshotId ?? null, lastAttemptAt: new Date().toISOString(), lastAttemptSucceeded: !!result, sourceDatabase: 'xenolinguist_atlas' };
  const temporary = path.join(directory, 'backup-status-' + randomUUID() + '.partial'), handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, path.join(directory, 'backup-status.json'));
}
