import { desktopRequest } from './desktop-request.mjs';
// Standalone acceptance harness: copy with the fixture to a fresh runner, install only Playwright.
import { _electron as electron } from 'playwright';
import { mkdtemp, readFile, writeFile, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
const [executable, fixture, report = 'clean-phones.json'] = process.argv.slice(2);
const require = createRequire(import.meta.url);
try { require.resolve('@huggingface/transformers'); throw new Error('Clean probe must not have Transformers installed'); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
const dir = await mkdtemp(path.join(os.tmpdir(), 'xeno-acceptance-clean-'));
const token = randomUUID().replaceAll('-', ''); await writeFile(path.join(dir, '.xeno-test-token'), token);
const env = { ...process.env, XENO_TEST_MODE: '1', XENO_TEST_TOKEN: token, NODE_PATH: '', NODE_OPTIONS: '', OLLAMA_BASE_URL: 'http://127.0.0.1:1' };
delete env.ELECTRON_RUN_AS_NODE;
const record = { sourceRevision: process.env.GITHUB_SHA ?? null, platform: process.platform, arch: process.arch, console: [] };
let app;
try {
  const exe = await realpath(executable);
  app = await electron.launch({ executablePath: exe, cwd: dir, args: [`--xeno-test-user-data=${dir}`], env, timeout: 40_000 });
  app.process().stdout?.on('data', data => record.console.push(data.toString()));
  app.process().stderr?.on('data', data => record.console.push(data.toString()));
  const page = await app.firstWindow(); await page.waitForURL(/http:\/\/127\.0\.0\.1:\d+/);
  const response = await desktopRequest(page).post(new URL('/api/ipa', page.url()).href, { data: { audio: (await readFile(fixture)).toString('base64') }, timeout: 180_000 });
  record.status = response.status(); record.result = await response.json();
  const model = path.join(path.dirname(exe), 'resources/ipa-model/wav2vec2-phoneme/onnx/model.onnx');
  const hash = createHash('sha256'); for await (const chunk of createReadStream(model)) hash.update(chunk);
  record.modelSha256 = hash.digest('hex');
  record.passed = record.status === 200 && record.result.ipa?.length > 0 && record.result.segments?.length > 0
    && record.result.identity?.alphabet === 'TIMIT ARPABET' && record.result.identity.modelSha256 === record.modelSha256;
  if (!record.passed) throw new Error('Clean packaged phone acceptance failed');
  console.log(`Clean Windows runner: ${record.result.segments.length} ARPABET segments; model ${record.modelSha256}`);
} catch (error) { record.passed = false; record.failure = error.message; process.exitCode = 1; }
finally { await app?.close(); await writeFile(report, JSON.stringify(record, null, 2)); }
