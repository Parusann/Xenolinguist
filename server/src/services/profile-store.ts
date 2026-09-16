import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { LanguageProfile, ProfileIndex } from '../../../shared/types.js';
import { pickProfileData } from '../../../shared/constants.js';
import { parseProfile, parseProfilePatch } from '../../../shared/schemas/profile.js';
import { mutationSchema } from '../../../shared/schemas/mutations.js';
import { applyOperations } from '../../../shared/profile-operations.js';
import { ProfileError } from '../../../shared/schemas/errors.js';
import { preserveLegacyBackup } from './profile-migrations.js';
import { readRecoverableProfile } from './storage-recovery.js';
import { withProfileLock } from './profile-locks.js';
import { atomicWrite } from './atomic-file.js';
import { dataDir } from '../config.js';
import { AudioStore } from './audio-store.js';
import { recordMetricSnapshot } from '../../../shared/metrics/workspace-metrics.js';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const toIndex = (p: LanguageProfile): ProfileIndex => ({ id: p.id, name: p.name, created_at: p.created_at, updated_at: p.updated_at });

export class ProfileStore {
  constructor(private readonly write = atomicWrite) {}
  private directory() { return path.join(dataDir(), 'profiles'); }
  private file(id: string) { return path.join(this.directory(), `${id}.json`); }
  private async init() { await fs.mkdir(this.directory(), { recursive: true }); }
  private locked<T>(id: string, action: () => Promise<T>) { return withProfileLock(this.file(id), action); }

  async list(): Promise<ProfileIndex[]> {
    await this.init();
    return withProfileLock(path.join(dataDir(), 'profiles.json'), async () => {
      const entries: ProfileIndex[] = [];
      // Files, not the index, are authoritative. Include missing primaries with a previous snapshot.
      const names = await fs.readdir(this.directory());
      const ids = new Set(names.filter(name => /\.json(?:\.prev)?$/.test(name)).map(name => name.replace(/\.json(?:\.prev)?$/, '')).filter(id => SAFE_ID.test(id)));
      for (const id of ids) {
        try { const profile = await this.get(id); if (profile) entries.push(toIndex(profile)); }
        catch (error) {
          // A damaged file remains visible alongside usable profiles, without inventing recovered content.
          const epoch = '1970-01-01T00:00:00.000Z';
          entries.push({ id, name: `Recovery required: ${id}`, created_at: epoch, updated_at: epoch,
            recovery_error: error instanceof ProfileError ? error.code : 'PROFILE_UNREADABLE' });
        }
      }
      entries.sort((a, b) => a.id.localeCompare(b.id));
      try { await this.write(path.join(dataDir(), 'profiles.json'), JSON.stringify(entries, null, 2)); }
      catch (error) { console.error('[profiles:index-refresh]', (error as Error).message); }
      return entries;
    });
  }

  async get(id: string): Promise<LanguageProfile | null> {
    await this.init();
    if (!SAFE_ID.test(id)) return null;
    const result = await readRecoverableProfile(this.file(id));
    if (result && result.profile.id !== id) throw new ProfileError('PROFILE_ID_MISMATCH', 'Profile identity does not match its file; the original has been preserved', 422);
    return result?.profile ?? null;
  }

  private async save(profile: LanguageProfile) {
    profile = parseProfile(recordMetricSnapshot(profile));
    await withProfileLock(`recovery:${this.file(profile.id)}`, async () => {
      await preserveLegacyBackup(this.file(profile.id));
      await this.write(this.file(profile.id), JSON.stringify(profile, null, 2), { previous: true });
    });
    // Lock order is profile -> index. Rebuilding the index only reads profiles and never takes their write locks.
    try { await this.list(); } catch (error) { console.error('[profiles:index-refresh]', (error as Error).message); }
    return profile;
  }

  async create(input: unknown): Promise<LanguageProfile> {
    await this.init();
    const now = new Date().toISOString();
    const profile = parseProfile({ ...pickProfileData(input), id: randomUUID(), created_at: now, updated_at: now });
    await new AudioStore().verifyProfile(profile);
    return this.locked(profile.id, () => this.save(profile));
  }

  async update(id: string, updates: unknown, expectedRevision: number): Promise<LanguageProfile | null> {
    const patch = parseProfilePatch(updates);
    if (!SAFE_ID.test(id)) return null;
    return this.locked(id, async () => {
      const existing = await this.get(id);
      if (!existing) return null;
      this.checkRevision(existing, expectedRevision);
      const profile = parseProfile({ ...existing, ...patch, revision: existing.revision + 1, updated_at: new Date().toISOString() });
      await new AudioStore().verifyProfile(profile, existing);
      return this.save(profile);
    });
  }

  private checkRevision(existing: LanguageProfile, expected: number) {
    if (!Number.isSafeInteger(expected) || expected < 0) throw new ProfileError('REVISION_REQUIRED', 'An expected profile revision is required', 428);
    if (existing.revision !== expected) throw new ProfileError('REVISION_CONFLICT', 'This profile changed since the edit began', 409, [], false, existing.revision);
  }

  /** Archive assets use fresh identities. The profile rename is the sole visibility/commit point. */
  async restoreArchive(profile: LanguageProfile, expectedRevision: number | undefined,
    prepare: (existing: LanguageProfile | null) => Promise<void>) {
    await this.init();
    profile = parseProfile(profile);
    return this.locked(profile.id, async () => {
      const existing = await this.get(profile.id);
      if (expectedRevision !== undefined) {
        if (!existing) throw new ProfileError('PROFILE_MISSING', 'Replacement project no longer exists', 404);
        this.checkRevision(existing, expectedRevision);
      } else if (existing) throw new ProfileError('PROFILE_EXISTS', 'Import identity already exists', 409);
      const restored = parseProfile({ ...profile, revision: existing ? Math.max(existing.revision, profile.revision) + 1 : profile.revision,
        recent_mutations: [], updated_at: new Date().toISOString() });
      await prepare(existing);
      await new AudioStore().verifyProfile(restored);
      await withProfileLock(`recovery:${this.file(restored.id)}`, async () => {
        await this.write(this.file(restored.id), JSON.stringify(restored, null, 2), { previous: Boolean(existing) });
      });
      // The index is a rebuildable cache; never turn a committed restore into a reported failure.
      try { await this.list(); } catch (error) { console.error('[archives:index-refresh]', (error as Error).message); }
      return restored;
    });
  }

  async mutate(id: string, input: unknown) {
    const mutation = mutationSchema.parse(input);
    if (!SAFE_ID.test(id)) return null;
    const digest = createHash('sha256').update(JSON.stringify(mutation.operations)).digest('hex');
    return this.locked(id, async () => {
      const existing = await this.get(id);
      if (!existing) return null;
      const previous = existing.recent_mutations.find(entry => entry.id === mutation.mutationId);
      if (previous) {
        if (previous.digest !== digest) throw new ProfileError('MUTATION_ID_REUSED', 'A mutation identifier cannot be reused for different operations', 409);
        return { profile: existing, appliedRevision: previous.revision, mutationId: mutation.mutationId, duplicate: true };
      }
      this.checkRevision(existing, mutation.expectedRevision);
      const revision = existing.revision + 1;
      const profile = parseProfile({ ...applyOperations(existing, mutation.operations), revision, updated_at: new Date().toISOString(),
        recent_mutations: [...existing.recent_mutations, { id: mutation.mutationId, digest, revision }].slice(-128) });
      await new AudioStore().verifyProfile(profile, existing);
      const saved = await this.save(profile);
      return { profile: saved, appliedRevision: revision, mutationId: mutation.mutationId, duplicate: false };
    });
  }

  async remove(id: string): Promise<void> {
    await this.init();
    if (!SAFE_ID.test(id)) return;
    await this.locked(id, async () => {
      // Share the recovery lock: an already-read snapshot must not restore a deleted profile.
      await withProfileLock(`recovery:${this.file(id)}`, async () => {
        await fs.rm(`${this.file(id)}.prev`, { force: true });
        await fs.rm(this.file(id), { force: true });
      });
      await this.list();
      // Audio and migration backups are retained for later explicit archive/garbage-collection work.
    });
  }
}
