import fs from 'node:fs/promises';
import path from 'node:path';
import { saveQueueRecordSchema } from '../shared/schemas/save-queue.js';
import { atomicWrite } from '../server/src/services/atomic-file.js';

/** Stable desktop storage: the loopback renderer port (and hence IndexedDB origin) changes on restart. */
export class DesktopDraftStore {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly directory: string) {}
  async list() {
    await fs.mkdir(this.directory, { recursive: true });
    const names = (await fs.readdir(this.directory)).filter(name => /^[A-Za-z0-9_-]{1,128}\.json$/.test(name));
    return Promise.all(names.map(async name => {
      const record = saveQueueRecordSchema.parse(JSON.parse(await fs.readFile(path.join(this.directory, name), 'utf8')));
      if (`${record.profileId}.json` !== name) throw new Error('Desktop draft file identity mismatch');
      return record;
    }));
  }
  put(input: unknown): Promise<void> {
    const record = saveQueueRecordSchema.parse(input);
    const body = JSON.stringify(record);
    if (Buffer.byteLength(body) > 64 * 1024 * 1024) throw new Error('Pending save exceeds the 64 MiB local draft limit');
    const write = async () => {
      await fs.mkdir(this.directory, { recursive: true });
      await atomicWrite(path.join(this.directory, `${record.profileId}.json`), body, { previous: true });
    };
    const next = this.chain.then(write, write);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
