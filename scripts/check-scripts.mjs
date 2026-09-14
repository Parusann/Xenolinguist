import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { root } from './verification-record.mjs';
for (const file of readdirSync(new URL('.', import.meta.url)).filter(file => file.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', 'scripts/' + file], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('All repository MJS scripts parse successfully');
