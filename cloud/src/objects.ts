import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, readdir, realpath, rename, statfs, unlink } from 'node:fs/promises';
import path from 'node:path';
import { atlasId, ATLAS_LIMITS } from '../../shared/schemas/atlas.js';

export class ObjectStore {
  constructor(readonly root: string) {}

  private filename(id: string) {
    return path.join(this.root, atlasId.parse(id) + '.blob');
  }

  private async checkRoot() {
    if ((await lstat(this.root)).isSymbolicLink() || await realpath(this.root) !== this.root)
      throw new Error('Object storage root changed');
  }

  async put(bytes: Buffer) {
    if (!bytes.length || bytes.length > ATLAS_LIMITS.bytes) throw new Error('Object exceeds storage bounds');
    await this.checkRoot();
    const volume = await statfs(this.root);
    if (volume.bavail * volume.bsize - bytes.length < 20 * 1024 ** 3)
      throw new Error('Object storage has reached its reserved headroom');
    const id = randomUUID();
    const temporary = path.join(this.root, id + '.partial');
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally { await file.close(); }
    await rename(temporary, this.filename(id));
    return { id, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  }

  async read(id: string, expected: { sha256: string; bytes: number }) {
    await this.checkRoot();
    const filename = this.filename(id);
    const before = await lstat(filename);
    if (!before.isFile() || before.isSymbolicLink() || before.size !== expected.bytes ||
        before.size > ATLAS_LIMITS.bytes) throw new Error('Object integrity check failed');
    const file = await open(filename, 'r');
    try {
      const opened = await file.stat();
      if (await realpath(filename) !== filename || opened.ino !== before.ino || opened.dev !== before.dev)
        throw new Error('Object path changed');
      const bytes = await file.readFile();
      if (bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256)
        throw new Error('Stored object hash differs');
      return bytes;
    } finally { await file.close(); }
  }

  async remove(id: string) {
    return this.removeFile(atlasId.parse(id) + '.blob');
  }

  async inventory() {
    await this.checkRoot();
    const names = await readdir(this.root), result = [];
    for (const name of names) {
      if (!/^[a-f0-9-]{36}\.(blob|partial)$/u.test(name)) continue;
      const id = name.slice(0, 36); atlasId.parse(id);
      const file = path.join(this.root, name), stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || await realpath(file) !== file) throw new Error('Unsafe object inventory path');
      result.push({ id, name, bytes: stat.size, modifiedAt: stat.mtimeMs });
    }
    return result;
  }

  async removePartial(id: string) {
    return this.removeFile(atlasId.parse(id) + '.partial');
  }

  private async removeFile(name: string) {
    await this.checkRoot();
    const filename = path.join(this.root, name);
    try {
      if (!(await lstat(filename)).isFile() || await realpath(filename) !== filename)
        throw new Error('Unsafe object cleanup path');
      await unlink(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
