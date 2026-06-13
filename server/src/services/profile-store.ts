import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type { LanguageProfile } from '../../../shared/types.js';
import { createDefaultProfile } from '../../../shared/constants.js';
import { dataDir } from '../config.js';

function profilesDir() { return path.join(dataDir(), 'profiles'); }
function indexFile() { return path.join(dataDir(), 'profiles.json'); }

interface ProfileIndex {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export class ProfileStore {
  private initialized = false;

  private async init() {
    if (this.initialized) return;
    await fs.mkdir(profilesDir(), { recursive: true });
    try {
      await fs.access(indexFile());
    } catch {
      await fs.writeFile(indexFile(), '[]', 'utf-8');
    }
    this.initialized = true;
  }

  private async readIndex(): Promise<ProfileIndex[]> {
    await this.init();
    const data = await fs.readFile(indexFile(), 'utf-8');
    return JSON.parse(data);
  }

  private async writeIndex(index: ProfileIndex[]) {
    await fs.writeFile(indexFile(), JSON.stringify(index, null, 2), 'utf-8');
  }

  async list(): Promise<ProfileIndex[]> {
    return this.readIndex();
  }

  async get(id: string): Promise<LanguageProfile | null> {
    await this.init();
    try {
      const data = await fs.readFile(path.join(profilesDir(), `${id}.json`), 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async create(input: Partial<LanguageProfile>): Promise<LanguageProfile> {
    await this.init();
    const now = new Date().toISOString();
    const profile: LanguageProfile = {
      ...createDefaultProfile(),
      ...input,
      id: uuid(),
      created_at: now,
      updated_at: now,
    };

    await fs.writeFile(
      path.join(profilesDir(), `${profile.id}.json`),
      JSON.stringify(profile, null, 2),
      'utf-8'
    );

    const index = await this.readIndex();
    index.push({
      id: profile.id,
      name: profile.name,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    });
    await this.writeIndex(index);

    return profile;
  }

  async update(id: string, updates: Partial<LanguageProfile>): Promise<LanguageProfile | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated: LanguageProfile = {
      ...existing,
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    };

    await fs.writeFile(
      path.join(profilesDir(), `${id}.json`),
      JSON.stringify(updated, null, 2),
      'utf-8'
    );

    const index = await this.readIndex();
    const entry = index.find(e => e.id === id);
    if (entry) {
      entry.name = updated.name;
      entry.updated_at = updated.updated_at;
      await this.writeIndex(index);
    }

    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.init();
    try {
      await fs.unlink(path.join(profilesDir(), `${id}.json`));
    } catch { /* ignore if missing */ }

    const index = await this.readIndex();
    const filtered = index.filter(e => e.id !== id);
    await this.writeIndex(filtered);
  }
}
