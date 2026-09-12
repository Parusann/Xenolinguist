import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from '../server/src/services/atomic-file.js';
import { audioDraftMetadataSchema, MAX_AUDIO_BYTES } from '../shared/schemas/audio.js';
import { entityIdSchema } from '../shared/schemas/common.js';
export class DesktopAudioDrafts {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly directory: string) {}
  private file(id: unknown) { return path.join(this.directory, `${entityIdSchema.parse(id)}.draft`); }
  private serialize<T>(action: () => Promise<T>) { const next = this.chain.then(action, action); this.chain = next.catch(() => {}); return next; }
  read(id: unknown) { return this.serialize(async () => {
    let bytes: Buffer;
    try { bytes = await fs.readFile(this.file(id)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    if (bytes.length < 4 || bytes.length > MAX_AUDIO_BYTES + 4096) throw new Error('Invalid audio draft size');
    const length = bytes.readUInt32LE(0);
    if (length > 4096 || length + 4 >= bytes.length) throw new Error('Invalid audio draft header');
    const metadata = audioDraftMetadataSchema.parse(JSON.parse(bytes.subarray(4, length + 4).toString('utf8')));
    if (metadata.profileId !== id) throw new Error('Audio draft identity mismatch');
    return { metadata, bytes: bytes.subarray(length + 4) };
  }); }
  write(id: unknown, input: { metadata?: unknown; bytes?: unknown }) { return this.serialize(async () => {
    const metadata = audioDraftMetadataSchema.parse(input?.metadata), file = this.file(id);
    if (metadata.profileId !== id || !(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > MAX_AUDIO_BYTES) throw new Error('Invalid audio draft');
    const header = Buffer.from(JSON.stringify(metadata)), length = Buffer.alloc(4); length.writeUInt32LE(header.length);
    await fs.mkdir(this.directory, { recursive: true });
    await atomicWrite(file, Buffer.concat([length, header, input.bytes]));
  }); }
  remove(id: unknown) { return this.serialize(() => fs.rm(this.file(id), { force: true })); }
}
