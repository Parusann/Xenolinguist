import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let tmp: string;

afterEach(async () => {
  delete process.env.DATA_DIR;
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

describe('ProfileStore honors DATA_DIR', () => {
  it('writes a created profile under DATA_DIR/profiles', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-store-'));
    process.env.DATA_DIR = tmp;
    const { ProfileStore } = await import('../services/profile-store.js?store=1');
    const store = new ProfileStore();
    const profile = await store.create({ name: 'Eridian' });
    const onDisk = await fs.readFile(path.join(tmp, 'profiles', `${profile.id}.json`), 'utf-8');
    expect(JSON.parse(onDisk).name).toBe('Eridian');
  });
});
