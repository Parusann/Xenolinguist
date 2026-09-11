// Exercise the actual service in Node, rather than maintaining a second inference implementation.
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, sourceIdentity, hashFile, inventory, saveRecord } from './verification-record.mjs';
const output = path.join(root, 'test-results/phone-service.mjs');
const fixture = path.join(root, 'server/src/__tests__/fixtures/hello-16k.wav');
process.env.IPA_MODEL_DIR ||= path.join(root, 'vendor/ipa-model');
await mkdir(path.dirname(output), { recursive: true });
await build({ entryPoints: [path.join(root, 'server/src/services/ipa-phones.ts')], outfile: output, bundle: true,
  platform: 'node', format: 'esm', target: 'node22', external: ['@huggingface/transformers'] });
const record = { source: sourceIdentity(), fixture: await hashFile(fixture), modelFiles: await inventory(process.env.IPA_MODEL_DIR) };
try {
  const { transcribePhones } = await import(pathToFileURL(output).href);
  record.result = await transcribePhones({ wav: await readFile(fixture) });
  if (!record.result.ipa || !record.result.segments.length || !record.result.identity?.modelSha256) throw new Error('Phone output or provenance missing');
  record.passed = true;
  console.log(`${record.result.segments.length} ARPABET phone segments; model ${record.result.identity.modelSha256}`);
} catch (error) { record.passed = false; record.failure = { code: error.code, message: error.message }; process.exitCode = 1; }
finally { await saveRecord(path.join(root, 'test-results/ipa-node.json'), record); }