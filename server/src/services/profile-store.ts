import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type { LanguageProfile, ProfileIndex } from '../../../shared/types.js';
import { createDefaultProfile, pickProfileData } from '../../../shared/constants.js';
import { dataDir } from '../config.js';

function profilesDir() { return path.join(dataDir(), 'profiles'); }
function audioDir() { return path.join(dataDir(), 'audio'); }
function indexFile() { return path.join(dataDir(), 'profiles.json'); }

// Profile ids reach get/update/remove straight from req.params.id and are
// interpolated into `${id}.json` paths. Constrain to a safe charset (UUIDs and
// the seeded demo id both match) so a crafted id cannot escape profilesDir()
// via path separators or `..` (arbitrary JSON read/overwrite/delete).
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Write to a temp sibling then rename — atomic on the same volume, so a crash or
 *  concurrent reader can never observe a truncated/corrupt JSON file. */
async function atomicWrite(file: string, contents: string): Promise<void> {
  const tmp = `${file}.${uuid()}.tmp`;
  await fs.writeFile(tmp, contents, 'utf-8');
  await fs.rename(tmp, file);
}

// Serialize all index read-modify-write sequences (module-level: every ProfileStore
// instance in this process shares the same profiles.json), so concurrent create/update/
// remove cannot interleave between readIndex and writeIndex and lose an update.
let indexChain: Promise<unknown> = Promise.resolve();
function withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = indexChain.then(fn, fn);
  indexChain = run.catch(() => undefined);
  return run;
}

function toIndexEntry(p: LanguageProfile): ProfileIndex {
  return { id: p.id, name: p.name, created_at: p.created_at, updated_at: p.updated_at };
}

export class ProfileStore {
  private initialized = false;

  private async init() {
    if (this.initialized) return;
    await fs.mkdir(profilesDir(), { recursive: true });
    try {
      await fs.access(indexFile());
    } catch {
      await atomicWrite(indexFile(), '[]');
    }
    this.initialized = true;
  }

  private async readIndex(): Promise<ProfileIndex[]> {
    await this.init();
    try {
      const parsed = JSON.parse(await fs.readFile(indexFile(), 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Missing/corrupt index → treat as empty; the next write will rebuild it.
      return [];
    }
  }

  private async writeIndex(index: ProfileIndex[]) {
    await atomicWrite(indexFile(), JSON.stringify(index, null, 2));
  }

  async list(): Promise<ProfileIndex[]> {
    return this.readIndex();
  }

  async get(id: string): Promise<LanguageProfile | null> {
    await this.init();
    if (!SAFE_ID.test(id)) return null;
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(profilesDir(), `${id}.json`), 'utf-8'));
      // Backfill any fields missing from older on-disk profiles so callers get a complete object.
      return { ...createDefaultProfile(), ...parsed } as LanguageProfile;
    } catch {
      return null;
    }
  }

  async create(input: Partial<LanguageProfile>): Promise<LanguageProfile> {
    await this.init();
    const now = new Date().toISOString();
    const profile: LanguageProfile = {
      ...pickProfileData(input),
      id: uuid(),
      created_at: now,
      updated_at: now,
    };

    await atomicWrite(path.join(profilesDir(), `${profile.id}.json`), JSON.stringify(profile, null, 2));

    await withIndexLock(async () => {
      const index = await this.readIndex();
      index.push(toIndexEntry(profile));
      await this.writeIndex(index);
    });

    return profile;
  }

  async update(id: string, updates: Partial<LanguageProfile>): Promise<LanguageProfile | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated: LanguageProfile = {
      ...pickProfileData({ ...existing, ...updates }),
      id,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };

    await atomicWrite(path.join(profilesDir(), `${id}.json`), JSON.stringify(updated, null, 2));

    await withIndexLock(async () => {
      const index = await this.readIndex();
      const entry = index.find((e) => e.id === id);
      if (entry) {
        entry.name = updated.name;
        entry.updated_at = updated.updated_at;
      } else {
        // Self-heal: the profile file exists but its index row was lost — re-add it.
        index.push(toIndexEntry(updated));
      }
      await this.writeIndex(index);
    });

    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.init();
    if (!SAFE_ID.test(id)) return;

    // Clean up the profile's audio blobs so deleting a profile doesn't orphan files on disk.
    const existing = await this.get(id);
    for (const clip of existing?.audio_clips ?? []) {
      if (clip?.id && SAFE_ID.test(clip.id)) {
        await fs.rm(path.join(audioDir(), `${clip.id}.webm`), { force: true });
        await fs.rm(path.join(audioDir(), `${clip.id}.wav`), { force: true });
      }
    }

    await fs.rm(path.join(profilesDir(), `${id}.json`), { force: true });

    await withIndexLock(async () => {
      const index = await this.readIndex();
      await this.writeIndex(index.filter((e) => e.id !== id));
    });
  }
}
