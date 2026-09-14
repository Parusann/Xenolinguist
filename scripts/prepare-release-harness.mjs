import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, sourceIdentity } from './verification-record.mjs';
const output = path.resolve(process.argv[2] || 'test-results/release-harness');
const mainPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const harnessPackage = JSON.parse(await readFile(path.join(root, 'scripts/release-harness/package.json'), 'utf8'));
if (harnessPackage.dependencies['@playwright/test'] !== mainPackage.devDependencies['@playwright/test']) throw Error('Release harness Playwright must match source lock');
for (const file of ['verify-release.mjs', 'desktop-request.mjs', 'verification-record.mjs', 'verify-artifact-layout.mjs']) {
  await mkdir(path.join(output, 'scripts'), { recursive: true }); await copyFile(path.join(root, 'scripts', file), path.join(output, 'scripts', file));
}
for (const file of ['package.json', 'package-lock.json']) await copyFile(path.join(root, 'scripts/release-harness', file), path.join(output, file));
await copyFile(path.join(root, 'package-lock.json'), path.join(output, 'source-package-lock.json'));
const fixture = 'server/src/__tests__/fixtures/hello-16k.wav'; await mkdir(path.dirname(path.join(output, fixture)), { recursive: true }); await copyFile(path.join(root, fixture), path.join(output, fixture));
await writeFile(path.join(output, 'source.json'), JSON.stringify(sourceIdentity(), null, 2));
console.log('Prepared standalone release harness: ' + output);
