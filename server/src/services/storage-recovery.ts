import { readProfileFile } from './profile-migrations.js';
import { atomicWrite } from './atomic-file.js';
import { withProfileLock } from './profile-locks.js';
import path from 'node:path';
import { ProfileError } from '../../../shared/schemas/errors.js';

/** Only restore a missing primary from a validated previous snapshot. Never overwrite invalid or future data. */
export async function readRecoverableProfile(file: string) {
  const current = await readProfileFile(file);
  if (current) return current;
  return withProfileLock(`recovery:${file}`, async () => {
    const again = await readProfileFile(file);
    if (again) return again;
    const previous = await readProfileFile(`${file}.prev`);
    if (!previous) return null;
    if (previous.profile.id !== path.basename(file, '.json')) throw new ProfileError('PROFILE_ID_MISMATCH', 'Recovery snapshot identity does not match its file', 422);
    await atomicWrite(file, previous.original);
    console.warn('[profiles:recovered-previous]', previous.profile.id, `Restored previous revision ${previous.profile.revision}; newer edits may be absent`);
    return previous;
  });
}
