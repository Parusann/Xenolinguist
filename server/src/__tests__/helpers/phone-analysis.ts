import { createHash } from 'node:crypto';
import { inspectPcmWav } from '../../../../shared/audio-container.js';
import { retainedPhoneResultSchema } from '../../../../shared/schemas/phone-analysis.js';
import { decodeCtcPhones } from '../../../../engine/src/audio/ctc.js';
import { planPhoneChunks } from '../../services/audio-chunks.js';

/** Synthetic logits for persistence tests. This is not a native model response. */
export function phoneFixture(wav: Buffer, phone = 'aa') {
  const geometry = inspectPcmWav(wav);
  if (geometry.channels !== 1 || geometry.rate !== 16000) throw new Error('Fixture requires mono 16 kHz PCM');
  let offset = 12;
  while (wav.toString('ascii', offset, offset + 4) !== 'data') { const size = wav.readUInt32LE(offset + 4); offset += 8 + size + (size & 1); }
  const audio = Float32Array.from({ length: wav.readUInt32LE(offset + 4) / 2 }, (_, i) => wav.readInt16LE(offset + 8 + i * 2) / 32768);
  const frames = Math.floor((audio.length - 400) / 320) + 1;
  const logits = new Float32Array(frames * 3);
  for (let i = 0; i < frames; i++) logits[i * 3] = 4;
  return retainedPhoneResultSchema.parse({ ...decodeCtcPhones(logits, frames, 3, 2, id => [phone, 'b', '<pad>'][id]),
    audio: { sha256: createHash('sha256').update(wav).digest('hex'), sampleRate: 16000, sampleCount: audio.length, durationSeconds: inspectPcmWav(wav).duration },
    identity: { modelId: 'synthetic-persistence-fixture', modelSha256: '0'.repeat(64), alphabet: 'TIMIT ARPABET', transformers: 'fixture', backend: 'fixture', node: process.version },
    processing: planPhoneChunks(audio) });
}
