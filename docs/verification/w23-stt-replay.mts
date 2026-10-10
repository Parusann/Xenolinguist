import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { transcriptionResultSchema } from '../../shared/schemas/transcription.js';
import { verifyTranscription } from '../../scripts/verify-transcription.mjs';

const here = new URL('.', import.meta.url);
const read = async (name: string) => JSON.parse(await readFile(new URL(name, here), 'utf8'));
const wav = await readFile(new URL('../../server/src/__tests__/fixtures/hello-16k.wav', here));
for (const kind of ['native', 'installed']) {
  const record = await read(`w23-stt-${kind}.json`);
  for (const [key, language] of [['automatic', 'auto'], ['explicit', 'en']]) {
    const result = transcriptionResultSchema.parse(record[key]);
    assert.equal(verifyTranscription(result, wav, record.runtimeFiles, language).passed, true);
  }
  assert.equal(record.source.revision, 'e33c030411b1b4a95b8ac53c6047ef6de9c3a89f');
}
console.log(JSON.stringify({ passed: true, responses: 4, audioSha256: createHash('sha256').update(wav).digest('hex'),
  scope: 'Validates retained response geometry, runtime inventories and language-selection metadata. Does not rerun inference, prove calibration or score recognition accuracy.' }));
