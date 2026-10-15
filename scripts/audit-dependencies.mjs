import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, hashFile } from './verification-record.mjs';
if (!process.env.npm_execpath) throw Error('Run through npm run audit:record');
await mkdir(path.join(root, 'test-results'), { recursive: true });
for (const [scope, extra] of [['all', []], ['production', ['--omit=dev']]]) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--json', ...extra], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  const report = JSON.parse(result.stdout);
  await writeFile(path.join(root, 'test-results/dependency-audit-' + scope + '.json'), JSON.stringify({ recordedAt: new Date().toISOString(), lockfile: await hashFile(path.join(root, 'package-lock.json')), ...report }, null, 2));
  if (![0, 1].includes(result.status) || report.error || report.auditReportVersion !== 2 || !report.metadata?.vulnerabilities) throw Error('Dependency audit failed to return a valid advisory report');
  console.log(scope + ': ' + JSON.stringify(report.metadata.vulnerabilities));
}
console.log('Advisories are retained for review; counts are not a vulnerability-free gate. See docs/dependency-review.md.');
