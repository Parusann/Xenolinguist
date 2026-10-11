import { readFile, writeFile } from 'node:fs/promises';
import { fingerprint } from './verify-artifact-layout.mjs';

const [installer, payloadFile, installedFile, upgradeFile, output, ...reports] = process.argv.slice(2);
if (!output || !reports.length) throw Error('Usage: release-manifest.mjs installer.exe payload.json installed.json upgrade.json output.json https://github.com/.../actions/runs/...');
const payload = JSON.parse(await readFile(payloadFile, 'utf8'));
const installed = JSON.parse(await readFile(installedFile, 'utf8'));
const upgrade = JSON.parse((await readFile(upgradeFile, 'utf8')).replace(/^\uFEFF/, ''));
if (!installed.acceptancePassed || !installed.checks.desktopRecovery?.passed || !upgrade.passed) throw Error('Required installed and upgrade gates did not pass');
if (payload.source.revision !== installed.source.revision || payload.lockSha256 !== installed.lockfile.sha256) throw Error('Evidence source/lock identity mismatch');
for (const url of reports) if (!/^https:\/\/github\.com\/Parusann\/Xenolinguist\/actions\/runs\/\d+$/.test(url)) throw Error('Expected exact repository workflow links');
const installerHash = await fingerprint(installer);
if (installed.artifact?.sha256 && installed.artifact.sha256 !== installerHash.sha256) throw Error('Installer identity mismatch');
await writeFile(output, JSON.stringify({ schemaVersion: 1, version: '1.1.0-rc.1', author: 'Parusan Natheeswaran',
  source: payload.source, lockSha256: payload.lockSha256, installer: installerHash, payload: await fingerprint(payloadFile),
  installedEvidence: await fingerprint(installedFile), upgradeEvidence: await fingerprint(upgradeFile), reports,
  signing: upgrade.signatureStatus, target: 'Windows x64', publication: 'draft', limitations: 'docs/release-checklist.md',
  integrityScope: 'Checksums bind retained files; not a reproducible-build or publisher-authentication claim.' }, null, 2) + '\n');
