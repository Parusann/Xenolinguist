import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test, expect, preparePage, openProfile, wavFixture, attachJson } from './fixtures';
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });
test.beforeEach(async ({ page }) => { await preparePage(page); });

test('W06 persists original bytes before worker processing so an interrupted preparation recovers', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Interrupted preparation' } })).json();
  await openProfile(page, server.url, profile.name);
  await page.evaluate(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
      setTimeout(() => post.call(this, message, Array.isArray(options) ? { transfer: options } : options), 10_000);
    };
  });
  await page.locator('input[type="file"]').setInputFiles(wavFixture);
  await expect.poll(() => page.evaluate(id => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('xenolinguist-audio-drafts', 1);
    request.onsuccess = () => { const db = request.result, tx = db.transaction('audio'); const read = tx.objectStore('audio').get(id);
      read.onsuccess = () => resolve(read.result?.blob.size ?? 0); tx.oncomplete = () => db.close(); };
    request.onerror = () => reject(request.error);
  }), profile.id)).toBe((await readFile(wavFixture)).length);
  await expect(page.getByText('Preparing audio…', { exact: true })).toBeVisible();
  page.on('dialog', dialog => { void dialog.accept(); });
  await openProfile(page, server.url, profile.name);
  await expect(page.getByText(/hello-16k.wav ·/)).toBeVisible();
});

test('W06 failed audio saves retain annotations across reload; retry, playback, export and undo preserve identity', async ({ page, server }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Audio recovery' } })).json();
  await openProfile(page, server.url, profile.name);
  await page.locator('input[type="file"]').setInputFiles(wavFixture);
  await expect(page.getByText(/hello-16k.wav ·/)).toBeVisible();
  await page.getByPlaceholder('Enter unknown language text… e.g. nesh tor krash.').fill('Retained audio');
  await page.getByPlaceholder('IPA, tone markers').fill('Retained notes');
  await page.getByRole('button', { name: 'Mark Words', exact: true }).click();
  const wave = page.locator('canvas').last();
  const bounds = await wave.boundingBox(); expect(bounds).toBeTruthy();
  await wave.click({ position: { x: bounds!.width * 0.1, y: 20 } });
  await wave.click({ position: { x: bounds!.width * 0.6, y: 20 } });
  await page.getByPlaceholder('Label this word...').fill('nesh');
  await page.getByRole('button', { name: '+ nesh', exact: true }).click();
  await page.route('**/api/audio/stages', route => route.fulfill({ status: 500, json: { error: 'Injected audio failure' } }));
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Injected audio failure');
  expect((await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json()).samples).toHaveLength(0);
  await openProfile(page, server.url, profile.name);
  await expect(page.getByText(/hello-16k.wav ·/)).toBeVisible();
  await expect(page.getByPlaceholder('Label this word...')).toHaveValue('nesh');
  await expect(page.getByPlaceholder('IPA, tone markers')).toHaveValue('Retained notes');
  await page.unroute('**/api/audio/stages');
  await page.route('**/api/profiles/*/mutations', route => route.fulfill({ status: 500, json: { error: 'Injected profile failure' } }));
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Audio sample is pending');
  await openProfile(page, server.url, profile.name);
  await expect(page.getByText(/hello-16k.wav ·/)).toBeVisible();
  await page.unroute('**/api/profiles/*/mutations');
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Discard audio draft' })).toHaveCount(0);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const saved = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  expect(saved.samples).toHaveLength(1); expect(saved.audio_clips).toHaveLength(1);
  expect(saved.audio_clips[0].segments[0].dictionary_entry_id).toBe(saved.dictionary[0].id);
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause audio', exact: true }).click();
  const downloaded = page.waitForEvent('download'); await page.getByRole('link', { name: 'Download original' }).click();
  const file = await downloaded, downloadedPath = await file.path(); expect(downloadedPath).toBeTruthy();
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  expect(hash(await readFile(downloadedPath!))).toBe(hash(await readFile(wavFixture)));
  await page.getByRole('button', { name: 'Delete sample Retained audio', exact: true }).click();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Retained audio', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await server.restart();
  const restored = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  expect(restored.samples).toEqual(saved.samples); expect(restored.audio_clips).toEqual(saved.audio_clips);
  const original = await page.request.get(`${server.url}/api/audio/${saved.samples[0].audio_id}`);
  expect(hash(await original.body())).toBe(hash(await readFile(wavFixture)));
  await attachJson('audio-lifecycle.json', { saved, restored, originalHash: hash(await original.body()), errors });
  expect(errors).toEqual([]);
});

test('W06 decodes a real WebM/Opus recording and keeps audio when explicit analysis fails', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Compressed audio' } })).json();
  await openProfile(page, server.url, profile.name);
  const bytes = await page.evaluate(async () => {
    const context = new AudioContext(), oscillator = context.createOscillator(), destination = context.createMediaStreamDestination();
    oscillator.connect(destination); oscillator.start(); await context.resume();
    const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
    const chunks: Blob[] = []; recorder.ondataavailable = event => chunks.push(event.data);
    const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
    recorder.start(); await new Promise(resolve => setTimeout(resolve, 700)); recorder.stop(); await stopped;
    oscillator.stop(); destination.stream.getTracks().forEach(track => track.stop()); await context.close();
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
  await page.locator('input[type="file"]').setInputFiles({ name: 'recorded.webm', mimeType: 'audio/webm', buffer: Buffer.from(bytes) });
  await expect(page.getByText(/recorded.webm ·/)).toBeVisible();
  await page.route('**/api/ipa', route => route.fulfill({ status: 503, json: { code: 'IPA_MODEL_MISSING' } }));
  await page.getByRole('button', { name: 'Analyze phones', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Phone model is missing');
  await expect(page.getByText(/recorded.webm ·/)).toBeVisible();
  await page.route('**/api/stt', route => route.fulfill({ json: { language: 'English', text: 'test', mode: 'transcription', segments: [{ start: 0, end: 0.2, text: 'test' }] } }));
  await page.getByRole('button', { name: 'Transcribe audio', exact: true }).click();
  await expect(page.getByPlaceholder('Label this word...')).toHaveValue('test');
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Discard audio draft' })).toHaveCount(0);
  const saved = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  expect(saved.audio_clips[0].assets.original.mime).toBe('audio/webm');
  expect(saved.audio_clips[0].assets.analysis.mime).toBe('audio/wav');
  const original = await page.request.get(`${server.url}/api/audio/${saved.samples[0].audio_id}`);
  expect(await original.body()).toEqual(Buffer.from(bytes));
  await page.getByTitle('Re-transcribe audio').click();
  await expect(page.getByText('Transcript: test', { exact: true })).toBeVisible();
});

test('W06 microphone capture uses the same durable draft and save flow without automatic model calls', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Microphone capture' } })).json();
  let modelRequests = 0;
  page.on('request', request => { if (/\/api\/(ipa|stt)$/.test(request.url())) modelRequests++; });
  await openProfile(page, server.url, profile.name);
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  // Capture enough real MediaRecorder output for the decoder to produce a valid clip.
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText(/recording.webm ·/)).toBeVisible();
  await openProfile(page, server.url, profile.name);
  await expect(page.getByText(/recording.webm ·/)).toBeVisible();
  await page.getByRole('button', { name: 'Add Sample', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Discard audio draft' })).toHaveCount(0);
  const saved = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  expect(saved.audio_clips[0].assets.original.mime).toBe('audio/webm'); expect(modelRequests).toBe(0);
});

test('W06 rejects unsupported, truncated and oversized imports without replacing a valid draft', async ({ page, server }) => {
  const profile = await (await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Invalid audio' } })).json();
  await openProfile(page, server.url, profile.name);
  await page.locator('input[type="file"]').setInputFiles(wavFixture);
  await expect(page.getByText(/hello-16k.wav ·/)).toBeVisible();
  for (const [name, bytes] of [['bad.mp3', Buffer.from('invalid')], ['short.wav', (await readFile(wavFixture)).subarray(0, 80)], ['large.wav', Buffer.alloc(32 * 1024 * 1024 + 1)]] as const) {
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'audio/wav', buffer: bytes });
    await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByText(/hello-16k.wav ·/)).toBeVisible();
  }
});
