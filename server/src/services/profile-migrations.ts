import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { migrateProfile } from '../../../shared/schemas/profile.js';
import { ProfileError } from '../../../shared/schemas/errors.js';

export async function readProfileFile(file: string) {
  let original: string;
  try { original = await fs.readFile(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new ProfileError('PROFILE_UNREADABLE', 'Profile file could not be read; the original has been preserved', 500, [], true);
  }
  let source: unknown;
  try { source = JSON.parse(original); }
  catch { throw new ProfileError('PROFILE_CORRUPT', 'Profile file contains invalid JSON; the original has been preserved', 422); }
  try { return { profile: migrateProfile(source), legacy: (source as { schema_version?: number }).schema_version !== 3, original }; }
  catch (error) {
    if (error instanceof ProfileError && error.code === 'PROFILE_INVALID')
      throw new ProfileError('PROFILE_INVALID_ON_DISK', 'Profile data failed validation; the original has been preserved', 422, error.issues);
    throw error;
  }
}

export async function preserveLegacyBackup(file: string) {
  const record = await readProfileFile(file);
  if (!record?.legacy) return;
  const version = (JSON.parse(record.original) as { schema_version?: number }).schema_version ?? 1;
  const backup = `${file}.v${version}.bak`;
  try { await fs.copyFile(file, backup, constants.COPYFILE_EXCL); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    // A previous migration attempt must not silently reuse a backup of different data.
    if (await fs.readFile(backup, 'utf8') !== record.original)
      throw new ProfileError('MIGRATION_BACKUP_CONFLICT', 'An existing backup differs from the original profile', 409);
  }
  const handle = await fs.open(backup, 'r+');
  try { await handle.sync(); } finally { await handle.close(); }
}
