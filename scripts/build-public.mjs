// Build the Pages variant separately, preserving client/dist for desktop tests.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Fixed generated-output directory under this repository, never a caller-supplied path.
const output = path.resolve(root, 'test-results/public-site');
if (path.dirname(output) !== path.join(root, 'test-results')) throw Error('Public output must stay under test-results');
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--base=/Xenolinguist/', '--outDir=' + output, '--emptyOutDir'], { cwd: path.join(root, 'client'), env: { ...process.env, VITE_PUBLIC_SITE: 'true' }, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
