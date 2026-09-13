import { randomBytes } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import { fork, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const root = path.resolve(__dirname, '../..');
export const wavFixture = path.join(root, 'server/src/__tests__/fixtures/hello-16k.wav');

class IsolatedServer {
  url = '';
  readonly secret = randomBytes(32).toString('hex');
  log = '';
  private child?: ChildProcess;
  constructor(readonly dataDir: string) {}
  async start() {
    let startupOutput = '';
    const child = fork(path.join(root, 'electron/dist/server.cjs'), [], {
      cwd: this.dataDir,
      env: { ...process.env, DATA_DIR: this.dataDir, PORT: '0', NODE_ENV: 'test',
        CLIENT_DIST: path.join(root, 'client/dist'), OLLAMA_BASE_URL: 'http://127.0.0.1:1',
        IPA_MODEL_DIR: '', WHISPER_BIN: '', WHISPER_MODEL: '', ESPEAK_PATH: '', XENO_START: '' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    this.child = child;
    child.send({ secret: this.secret, mode: 'development' });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('Test server did not start')); }, 15_000);
      child.once('error', err => { clearTimeout(timer); reject(err); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited: ${code}`)); });
      child.stdout!.on('data', chunk => {
        this.log += chunk.toString();
        startupOutput += chunk.toString();
        const port = startupOutput.match(/ready on (\d+)/)?.[1];
        if (port) { this.url = `http://127.0.0.1:${port}`; clearTimeout(timer); resolve(); }
      });
      child.stderr!.on('data', chunk => { this.log += chunk.toString(); });
    });
  }
  async stop() {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Test server did not exit')), 10_000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill();
    });
  }
  async restart() { await this.stop(); await this.start(); }
}

export const test = base.extend<{ server: IsolatedServer }>({
  server: async ({ context }, use, info) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'xeno-acceptance-browser-'));
    const server = new IsolatedServer(dir);
    try { await server.start(); await context.addCookies([{ name: 'xeno_dev_session', value: server.secret, url: server.url + '/api', path: undefined, httpOnly: true, sameSite: 'Strict' }]); await use(server); }
    finally {
      await server.stop();
      await info.attach('backend.log', { body: server.log, contentType: 'text/plain' });
      await info.attach('isolation.json', { body: JSON.stringify({ dataDir: dir }), contentType: 'application/json' });
      // Retain only synthetic test data for diagnosis; never remove a caller-supplied path.
    }
  },
});
export { expect };

export async function preparePage(page: Page) {
  await page.addInitScript(() => localStorage.setItem('xenolinguist-tour-completed', '1'));
  await page.route('**/api/ollama/status', route => route.fulfill({ json: { connected: true, ready: true, models: ['fixture-model'] } }));
  // This fixture is deterministic UI input, not a claim of real model inference.
  await page.route('**/api/ai/stream', route => route.fulfill({
    contentType: 'text/event-stream', body: `data: ${JSON.stringify({ token: JSON.stringify({
      language_name: 'Test Language', phoneme_set: ['a', 't'], number_base: 10, word_order: 'SVO',
      rules: ['Subject precedes verb'], number_words: { '1': 'ka', '2': 'ki', '3': 'ku' },
      vocabulary: [{ alien: 'tal', english: 'water', pos: 'noun' }],
      sample_sentences: [{ alien: 'tal', english: 'water' }],
    }) })}\n\ndata: [DONE]\n\n`,
  }));
}

export async function openProfile(page: Page, url: string, name: string) {
  await page.goto(`${url}/app`);
  await page.getByRole('button').filter({ has: page.getByText(name, { exact: true }) }).click();
}

export async function attachJson(name: string, value: unknown) {
  const file = test.info().outputPath(name);
  await writeFile(file, JSON.stringify(value, null, 2));
  await test.info().attach(name, { path: file, contentType: 'application/json' });
}
