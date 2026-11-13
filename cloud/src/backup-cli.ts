import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.js';
import { createBackup, latestBackup, verifyBackup } from './backup.js';
import { saveBackupStatus } from './backup-status.js';

const config = await loadConfig(), password = process.env.RESTIC_PASSWORD;
if (!password || password.length < 32) throw new Error('Load the protected recovery configuration through the PowerShell launcher');
const action = process.argv[2];
if (!['create', 'verify'].includes(action)) throw new Error('Choose create or verify');
try {
  const options = { password }, backup = action === 'create' ? await createBackup(config, options) : null;
  console.log(backup ? 'Encrypted snapshot created. Verifying its complete restore.' : 'Verifying the selected recovery snapshot.');
  const id = backup?.snapshotId ?? (process.argv[3] === 'latest' ? await latestBackup(config, options) : process.argv[3]);
  const verification = await verifyBackup(config, options, id);
  if (verification.sourceDatabase !== 'xenolinguist_atlas') throw new Error('Recovery snapshot belongs to a different database');
  await saveBackupStatus(config.root, verification);
  const output = path.join(config.root, 'logs/atlas/recovery-' + randomUUID() + '.json');
  await writeFile(output, JSON.stringify({ backup, verification }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ backup, verification, record: output }, null, 2));
} catch (error) { await saveBackupStatus(config.root).catch(() => {}); console.error(error instanceof Error ? error.message : 'Recovery verification failed'); process.exitCode = 1; }
