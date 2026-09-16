import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { dataDir } from '../config.js';
import { atomicWrite } from './atomic-file.js';
import { withProfileLock } from './profile-locks.js';
import { wavToFloat32 } from './ipa-phones.js';
import { ProfileError } from '../../../shared/schemas/errors.js';
import { stagedAudioSchema, MAX_AUDIO_BYTES, type StagedAudio } from '../../../shared/schemas/audio.js';
import { inspectPcmWav } from '../../../shared/audio-container.js';
import type { LanguageProfile } from '../../../shared/types.js';
const SAFE = /^[A-Za-z0-9_-]{1,128}$/;
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export function originalMime(bytes: Buffer): 'audio/wav' | 'audio/webm' {
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new ProfileError('AUDIO_SIZE_INVALID', 'Audio must be between 1 byte and 32 MiB', 413);
  if (bytes.length >= 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') {
    try { inspectPcmWav(bytes); } catch (error) { throw new ProfileError('AUDIO_INVALID', (error as Error).message); }
    return 'audio/wav';
  }
  // Browser decoding validates the compressed stream; require the WebM/Opus container markers here.
  if (bytes.length > 64 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    && bytes.includes(Buffer.from('webm')) && bytes.includes(Buffer.from('A_OPUS')) && bytes.includes(Buffer.from('OpusHead'))) return 'audio/webm';
  throw new ProfileError('AUDIO_UNSUPPORTED', 'Supported originals are PCM16 WAV and WebM/Opus');
}
export class AudioStore {
  root() { return path.join(dataDir(), 'audio-assets'); }
  directory(id: string) { if (!SAFE.test(id)) throw new ProfileError('AUDIO_ID_INVALID', 'Invalid audio identifier'); return path.join(this.root(), id); }
  async metadata(id: string): Promise<StagedAudio | null> {
    try { const record = stagedAudioSchema.parse(JSON.parse(await fs.readFile(path.join(this.directory(id), 'metadata.json'), 'utf8')));
      if (record.id !== id) throw new Error('Audio identity mismatch'); return record; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async stage(original: Buffer) {
    const mime = originalMime(original), id = randomUUID(), directory = this.directory(id);
    await fs.mkdir(directory, { recursive: true });
    const record: StagedAudio = { id, createdAt: new Date().toISOString(), original: { mime, bytes: original.length, sha256: digest(original) }, state: 'staged' };
    await atomicWrite(path.join(directory, 'original'), original);
    await atomicWrite(path.join(directory, 'metadata.json'), JSON.stringify(record));
    return record;
  }
  async complete(id: string, analysis: Buffer) {
    let duration: number;
    try { duration = wavToFloat32(analysis).length / 16000; } catch { throw new ProfileError('AUDIO_ANALYSIS_INVALID', 'Analysis must be mono PCM16 at 16 kHz, 25 ms–120 seconds'); }
    return withProfileLock(`audio:${this.directory(id)}`, async () => {
      const record = await this.metadata(id);
      if (!record) throw new ProfileError('AUDIO_STAGE_MISSING', 'Audio staging expired; upload the original again', 404);
      const file = { mime: 'audio/wav' as const, bytes: analysis.length, sha256: digest(analysis) };
      if (record.analysis) {
        if (record.analysis.sha256 !== file.sha256) throw new ProfileError('AUDIO_IMMUTABLE', 'Retained audio cannot be replaced', 409);
        await this.verifyFile(id, 'original', record.original);
        await this.verifyFile(id, 'analysis', record.analysis);
        return record;
      }
      const original = await this.verifyFile(id, 'original', record.original);
      if (record.original.mime === 'audio/wav' && Math.abs(inspectPcmWav(original).duration - duration) > 0.001)
        throw new ProfileError('AUDIO_DURATION_MISMATCH', 'Original and analysis duration must match');
      await atomicWrite(path.join(this.directory(id), 'analysis'), analysis);
      const complete = { ...record, analysis: file, duration, state: 'retained' as const };
      // Retain before acknowledgment so pending profile mutations and undo can safely reference it.
      await atomicWrite(path.join(this.directory(id), 'metadata.json'), JSON.stringify(complete));
      return complete;
    });
  }
  async verifyFile(id: string, kind: 'original' | 'analysis', expected: { bytes: number; sha256: string }) {
    let bytes: Buffer;
    try { bytes = await fs.readFile(path.join(this.directory(id), kind)); }
    catch { throw new ProfileError('AUDIO_ASSET_MISSING', 'Audio bytes are missing; restore the attachment before saving', 409); }
    if (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256) throw new ProfileError('AUDIO_ASSET_CHANGED', 'Audio bytes failed checksum verification', 409);
    return bytes;
  }
  async verifyProfile(next: LanguageProfile, before?: LanguageProfile) {
    for (const clip of next.audio_clips) {
      const old = before?.audio_clips.find(entry => entry.id === clip.id);
      const newReference = next.samples.some(sample => sample.audio_id === clip.id && before?.samples.find(previous => previous.id === sample.id)?.audio_id !== clip.id);
      if (old && !newReference && JSON.stringify(old.assets) === JSON.stringify(clip.assets)) continue;
      if (!clip.assets) {
        const legacy = await Promise.all(['wav', 'webm'].map(ext => fs.stat(path.join(dataDir(), 'audio', `${clip.id}.${ext}`)).then(() => true, () => false)));
        if (!legacy.some(Boolean)) throw new ProfileError('AUDIO_ASSET_MISSING', 'Imported audio metadata has no local file', 409);
        continue;
      }
      const record = await this.metadata(clip.id);
      if (!record || record.state !== 'retained' || !record.analysis || record.duration !== clip.duration
        || JSON.stringify({ original: record.original, analysis: record.analysis }) !== JSON.stringify(clip.assets))
        throw new ProfileError('AUDIO_ASSET_MISSING', 'Audio must finish staging before the profile is saved', 409);
      await this.verifyFile(clip.id, 'original', record.original); await this.verifyFile(clip.id, 'analysis', record.analysis);
    }
  }
  async cleanup(now = Date.now()) {
    await fs.mkdir(this.root(), { recursive: true });
    for (const id of await fs.readdir(this.root())) {
      if (!SAFE.test(id)) continue;
      await withProfileLock(`audio:${this.directory(id)}`, async () => {
        const record = await this.metadata(id);
        const created = record ? Date.parse(record.createdAt) : (await fs.stat(this.directory(id))).mtimeMs;
        if (record?.state === 'retained' || now - created < 24 * 60 * 60 * 1000) return;
        const directory = this.directory(id);
        if (path.dirname(directory) !== this.root()) throw new Error('Unsafe audio cleanup path');
        await fs.rm(directory, { recursive: true });
      });
    }
  }
}
