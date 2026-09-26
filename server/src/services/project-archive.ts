import { remapResearch } from '../../../shared/research-remap.js';
import { verifyResearch } from './research-integrity.js';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as yauzl from 'yauzl';
import { ZipFile } from 'yazl';
import { ARCHIVE_LIMITS as LIMIT, archiveManifestSchema, archiveRestoreSchema, type ArchiveManifest,
  type ArchivePreview, type ArchiveRestore } from '../../../shared/schemas/archive.js';
import { migrateProfile, parseProfile } from '../../../shared/schemas/profile.js';
import { ProfileError } from '../../../shared/schemas/errors.js';
import type { LanguageProfile } from '../../../shared/types.js';
import { dataDir } from '../config.js';
import { ProfileStore } from './profile-store.js';
import { AudioStore, originalMime } from './audio-store.js';
import { wavToFloat32 } from './ipa-phones.js';
import { inspectPcmWav } from '../../../shared/audio-container.js';
import { atomicWrite } from './atomic-file.js';
import { readCompilerRecord, writeCompilerRecord, validateCompilerRecord } from './compiler-sandbox.js';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const invalid = (message: string) => new ProfileError('ARCHIVE_INVALID', message, 422);
const allowed = /^(manifest\.json|profile\.json|compiler-session\.json|audio\/[A-Za-z0-9_-]{1,128}\/(original|analysis|legacy\.wav|legacy\.webm))$/;
type Member = { file: string; bytes: number; sha256: string };
type Inspection = { directory: string; members: Map<string, Member>; profile: LanguageProfile; manifest: ArchiveManifest; expires: number };

/** Sequential bounded IO: never expand a ZIP into caller-controlled filesystem paths. */
async function copyBounded(input: Readable, file: string, max: number) {
  let bytes = 0;
  const sha = createHash('sha256');
  await pipeline(input, new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.length;
    if (bytes > max) { callback(new ProfileError('ARCHIVE_TOO_LARGE', 'Archive exceeds its size limit', 413)); return; }
    sha.update(chunk); callback(null, chunk);
  } }), createWriteStream(file, { flags: 'wx' }));
  return { file, bytes, sha256: sha.digest('hex') };
}

function remap(source: LanguageProfile, targetId: string) {
  const profile = structuredClone(source), ids = new Map<string, string>();
  for (const collection of [profile.dictionary, profile.grammar_rules, profile.samples, profile.audio_clips])
    for (const entry of collection) ids.set(entry.id, randomUUID());
  for (const records of Object.values(profile.research)) for (const record of records) ids.set(record.id, randomUUID());
  profile.research = remapResearch(profile.research, ids);
  profile.id = targetId; profile.recent_mutations = [];
  if (profile.compiler_session_id) profile.compiler_session_id = randomUUID();
  profile.dictionary.forEach(entry => { entry.id = ids.get(entry.id)!; });
  profile.grammar_rules.forEach(entry => { entry.id = ids.get(entry.id)!; });
  profile.samples.forEach(entry => { entry.id = ids.get(entry.id)!; if (entry.audio_id) entry.audio_id = ids.get(entry.audio_id)!; });
  profile.audio_clips.forEach(clip => {
    clip.id = ids.get(clip.id)!;
    clip.segments.forEach(segment => { segment.id = randomUUID();
      if (segment.dictionary_entry_id) segment.dictionary_entry_id = ids.get(segment.dictionary_entry_id)!; });
  });
  profile.ai_history?.forEach(record => { record.id = randomUUID(); });
  if (profile.sandbox_session) {
    profile.sandbox_session.id = randomUUID();
    profile.sandbox_session.events.forEach(event => { event.id = randomUUID(); });
    // Challenge identifiers are deterministic, session-local answer-key positions. Preserve their references.
  }
  return { profile: parseProfile(profile), ids };
}

export class ProjectArchives {
  private previews = new Map<string, Inspection>();
  private busy = false;
  constructor(private readonly profiles = new ProfileStore()) {}
  private root() { return path.join(dataDir(), 'archive-staging'); }
  private async remove(directory: string) {
    if (path.dirname(path.resolve(directory)) !== path.resolve(this.root()) || !/^[a-f0-9-]{36}$/.test(path.basename(directory)))
      throw new Error('Invalid archive staging directory');
    await fs.rm(directory, { recursive: true, force: true });
  }
  async discard(token: string) {
    const inspection = this.previews.get(token);
    if (!inspection) return;
    this.previews.delete(token); await this.remove(inspection.directory);
  }
  private async workspace() {
    await fs.mkdir(this.root(), { recursive: true });
    for (const name of await fs.readdir(this.root())) {
      if (!/^[a-f0-9-]{36}$/.test(name)) continue;
      const directory = path.join(this.root(), name), stat = await fs.lstat(directory);
      if (stat.isSymbolicLink()) continue;
      if (Date.now() - stat.mtimeMs > LIMIT.previewMs) {
        this.previews.delete(name); await this.remove(directory);
      }
    }
    if ((await fs.readdir(this.root())).length >= 3) throw new ProfileError('ARCHIVE_BUSY', 'Cancel a preview or wait ten minutes before opening another archive', 429);
    const directory = path.join(this.root(), randomUUID());
    await fs.mkdir(directory); return directory;
  }
  /** Reject parallel heavy operations instead of buffering a queue of uploads in memory. */
  async exclusive<T>(action: () => Promise<T>) {
    if (this.busy) throw new ProfileError('ARCHIVE_BUSY', 'Another archive operation is running', 429);
    this.busy = true;
    try { return await action(); } finally { this.busy = false; }
  }

  private async pack(profile: LanguageProfile, includeSandbox: boolean, directory: string) {
    profile = structuredClone(profile);
    if (!includeSandbox) { delete profile.sandbox_session; delete profile.compiler_session_id; }
    const members = new Map<string, Member>();
    let total = 0;
    const add = async (name: string, input: Readable, max = LIMIT.memberBytes as number) => {
      if (members.size >= LIMIT.entries - 1) throw invalid('Too many archive members');
      const member = await copyBounded(input, path.join(directory, `member-${members.size}`), Math.min(max, LIMIT.bytes - total));
      total += member.bytes; members.set(name, member);
    };
    await add('profile.json', Readable.from([Buffer.from(JSON.stringify(profile))]), LIMIT.profileBytes);
    if (profile.compiler_session_id) await add('compiler-session.json', Readable.from([Buffer.from(JSON.stringify(await readCompilerRecord(profile.compiler_session_id)))]), LIMIT.profileBytes);
    const audio = new AudioStore();
    for (const clip of profile.audio_clips) {
      if (clip.assets) {
        for (const kind of ['original', 'analysis'] as const) {
          await add(`audio/${clip.id}/${kind}`, createReadStream(path.join(audio.directory(clip.id), kind)));
          const member = members.get(`audio/${clip.id}/${kind}`)!;
          if (member.bytes !== clip.assets[kind].bytes || member.sha256 !== clip.assets[kind].sha256)
            throw invalid('A recording failed verification; repair it before exporting');
        }
      } else {
        let found = false;
        for (const ext of ['wav', 'webm']) {
          const file = path.join(dataDir(), 'audio', `${clip.id}.${ext}`);
          try { await fs.access(file); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
          await add(`audio/${clip.id}/legacy.${ext}`, createReadStream(file)); found = true;
        }
        if (!found) throw invalid('A legacy recording is missing; a complete backup cannot be created');
      }
    }
    const manifest: ArchiveManifest = { format: 'xenolinguist', archiveVersion: profile.compiler_session_id ? 2 : 1, profileSchemaVersion: 3,
      createdAt: new Date().toISOString(), sourceProfileId: profile.id, sourceRevision: profile.revision,
      sandboxIncluded: includeSandbox, members: [...members].map(([name, member]) => ({ path: name, bytes: member.bytes, sha256: member.sha256 })) };
    archiveManifestSchema.parse(manifest);
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    if (manifestBytes.length > LIMIT.manifestBytes || total + manifestBytes.length > LIMIT.bytes) throw invalid('Archive exceeds expanded size limit');
    const zip = new ZipFile(), output = path.join(directory, 'project.xeno');
    // Store entries without compression: predictable resources, no self-generated compression bombs.
    zip.addBuffer(manifestBytes, 'manifest.json', { compress: false });
    for (const [name, member] of members) zip.addFile(member.file, name, { compress: false });
    const outputStream = zip.outputStream as Readable;
    zip.on('error', error => outputStream.destroy(error));
    const writing = copyBounded(outputStream, output, LIMIT.bytes);
    zip.end(); await writing;
    return output;
  }

  async export(id: string, revision: number, includeSandbox: boolean) {
    const profile = await this.profiles.get(id);
    if (!profile) throw new ProfileError('PROFILE_MISSING', 'Project not found', 404);
    if (profile.revision !== revision) throw new ProfileError('REVISION_CONFLICT', 'Save and reload the project before exporting', 409);
    const directory = await this.workspace();
    try { const file = await this.pack(profile, includeSandbox, directory);
      return { file, dispose: () => this.remove(directory) }; }
    catch (error) { await this.remove(directory); throw error; }
  }

  async inspect(input: Readable): Promise<ArchivePreview> {
    const directory = await this.workspace();
    let zip: yauzl.ZipFile | undefined;
    try {
      const source = path.join(directory, 'upload.xeno');
      await copyBounded(input, source, LIMIT.bytes);
      zip = await yauzl.openPromise(source, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true });
      if (zip.entryCount > LIMIT.entries) throw invalid('Too many archive entries');
      const members = new Map<string, Member>(); let total = 0;
      for await (const entry of zip.eachEntry()) {
        const name = entry.fileName, kind = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (!allowed.test(name) || members.has(name) || (kind !== 0 && kind !== 0x8000)
          || (entry.externalFileAttributes & 0x10) || entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod))
          throw invalid('Unsafe, duplicate, encrypted or unsupported archive member');
        const max = name === 'manifest.json' ? LIMIT.manifestBytes : name === 'profile.json' ? LIMIT.profileBytes : LIMIT.memberBytes;
        if (entry.uncompressedSize > max || entry.uncompressedSize > Math.max(1, entry.compressedSize) * LIMIT.ratio
          || total + entry.uncompressedSize > LIMIT.bytes || members.size >= LIMIT.entries)
          throw invalid('Archive expansion exceeds its limits');
        const member = await copyBounded(await zip.openReadStreamPromise(entry), path.join(directory, `member-${members.size}`), Math.min(max, entry.uncompressedSize));
        if (member.bytes !== entry.uncompressedSize) throw invalid('Archive member size mismatch');
        total += member.bytes; members.set(name, member);
      }
      const json = async (name: string) => {
        const member = members.get(name); if (!member) throw invalid(`Missing ${name}`);
        return JSON.parse(await fs.readFile(member.file, 'utf8')) as Record<string, unknown>;
      };
      const rawManifest = await json('manifest.json');
      if (![1, 2].includes(rawManifest.archiveVersion as number) || ![2, 3].includes(rawManifest.profileSchemaVersion as number))
        throw new ProfileError('ARCHIVE_VERSION_UNSUPPORTED', 'This archive requires a different application version. No project was changed.', 422);
      const manifest = archiveManifestSchema.parse(rawManifest), declared = new Set<string>();
      for (const member of manifest.members) {
        const actual = members.get(member.path);
        if (declared.has(member.path) || !actual || actual.bytes !== member.bytes || actual.sha256 !== member.sha256)
          throw invalid('Archive member is missing, duplicated or failed checksum verification');
        declared.add(member.path);
      }
      if (members.size !== declared.size + 1) throw invalid('Archive contains undeclared members');
      const rawProfile = await json('profile.json');
      // History schemas allow legacy callers to omit fields; archives must never silently drop unknown fields.
      if (Array.isArray(rawProfile.ai_history) && rawProfile.ai_history.some(record => !record || typeof record !== 'object'
        || Object.keys(record).some(key => !['id', 'role', 'content', 'timestamp', 'model', 'task', 'state', 'error'].includes(key))))
        throw invalid('Incompatible AI history fields');
      if (rawProfile.schema_version !== manifest.profileSchemaVersion) throw invalid('Profile schema does not match manifest');
      const profile = migrateProfile(rawProfile), expected = new Set(['profile.json']);
      verifyResearch(profile);
      if (profile.id !== manifest.sourceProfileId || profile.revision !== manifest.sourceRevision
        || (!manifest.sandboxIncluded && profile.sandbox_session)) throw invalid('Manifest does not match its project');
      if (profile.compiler_session_id) {
        if (manifest.archiveVersion !== 2 || !manifest.sandboxIncluded) throw invalid('Compiler session requires a complete version 2 sandbox archive');
        validateCompilerRecord(await json('compiler-session.json')); expected.add('compiler-session.json');
      }
      for (const clip of profile.audio_clips) {
        if (clip.assets) {
          for (const kind of ['original', 'analysis'] as const) {
            const name = `audio/${clip.id}/${kind}`, member = members.get(name), asset = clip.assets[kind];
            if (!member || member.bytes !== asset.bytes || member.sha256 !== asset.sha256) throw invalid('Referenced recording is missing or changed');
            expected.add(name);
          }
          const original = await fs.readFile(members.get(`audio/${clip.id}/original`)!.file);
          const analysis = await fs.readFile(members.get(`audio/${clip.id}/analysis`)!.file);
          const duration = wavToFloat32(analysis).length / 16000;
          if (originalMime(original) !== clip.assets.original.mime || clip.assets.analysis.mime !== 'audio/wav'
            || duration !== clip.duration || (clip.assets.original.mime === 'audio/wav' && Math.abs(inspectPcmWav(original).duration - duration) > 0.001))
            throw invalid('Recording format or duration does not match its metadata');
        } else {
          const names = ['wav', 'webm'].map(ext => `audio/${clip.id}/legacy.${ext}`).filter(name => members.has(name));
          if (!names.length) throw invalid('Referenced legacy recording is missing');
          names.forEach(name => expected.add(name));
        }
      }
      if (expected.size !== declared.size || [...declared].some(name => !expected.has(name))) throw invalid('Archive contains unreferenced assets');
      const token = path.basename(directory), expires = Date.now() + LIMIT.previewMs;
      this.previews.set(token, { directory, members, profile, manifest, expires });
      return { token, expiresAt: new Date(expires).toISOString(), name: profile.name, sourceRevision: profile.revision,
        sandboxIncluded: manifest.sandboxIncluded, expandedBytes: total,
        counts: { words: profile.dictionary.length, rules: profile.grammar_rules.length, samples: profile.samples.length,
          recordings: profile.audio_clips.length, proposals: profile.ai_history?.length ?? 0, snapshots: profile.metric_snapshots?.length ?? 0 },
        warnings: [
          ...(!manifest.sandboxIncluded ? ['Sandbox answers and progress were excluded from this export.'] : []),
          ...(profile.audio_clips.some(clip => !clip.assets) ? ['Legacy recordings are preserved in their existing format; analysis audio may be unavailable.'] : []),
          'Only saved project state is included. Unsaved drafts, session activity and running jobs are not archived.',
        ] };
    } catch (error) {
      zip?.close(); await this.remove(directory);
      if (error instanceof ProfileError && error.code === 'PROFILE_INVALID')
        throw invalid(`Incompatible project fields: ${error.issues.slice(0, 3).map(issue => `${issue.path.join('.') || 'profile'}: ${issue.message}`).join('; ').slice(0, 500)}. No project was changed.`);
      if (error instanceof ProfileError) throw error;
      throw invalid('Invalid or incompatible archive. Check its format, fields and completeness; no project was changed.');
    } finally { zip?.close(); }
  }

  async restore(token: string, options: ArchiveRestore) {
    options = archiveRestoreSchema.parse(options);
    const inspection = this.previews.get(token);
    if (!inspection || inspection.expires < Date.now()) { await this.discard(token); throw new ProfileError('ARCHIVE_EXPIRED', 'Preview expired; select the archive again', 410); }
    const { profile, ids } = remap(inspection.profile, options.mode === 'new' ? randomUUID() : options.targetId);
    let backupId: string | undefined;
    const result = await this.profiles.restoreArchive(profile, options.mode === 'replace' ? options.expectedRevision : undefined, async existing => {
      // Recheck staged bytes immediately before publication, including changes after preview.
      for (const member of inspection.members.values()) {
        const bytes = await fs.readFile(member.file);
        if (bytes.length !== member.bytes || hash(bytes) !== member.sha256) throw invalid('Staged archive changed; inspect the original again');
      }
      if (existing) {
        const directory = await this.workspace();
        try {
          const file = await this.pack(existing, true, directory);
          backupId = `${existing.id}-${randomUUID()}.xeno`;
          const backups = path.join(dataDir(), 'archive-backups'); await fs.mkdir(backups, { recursive: true });
          // Flush the backup before committing any replacement. It is independent of .prev rotation.
          const handle = await fs.open(file, 'r+'); try { await handle.sync(); } finally { await handle.close(); }
          await fs.rename(file, path.join(backups, backupId));
        } finally { await this.remove(directory); }
      }
      const audio = new AudioStore();
      if (profile.compiler_session_id) {
        const member = inspection.members.get('compiler-session.json')!;
        const record = validateCompilerRecord(JSON.parse(await fs.readFile(member.file, 'utf8')));
        record.sessionId = randomUUID(); record.events.forEach(event => { event.id = randomUUID(); });
        await writeCompilerRecord(record, profile.compiler_session_id);
      }
      for (const clip of inspection.profile.audio_clips) {
        const id = ids.get(clip.id)!;
        if (clip.assets) {
          const directory = audio.directory(id); await fs.mkdir(directory, { recursive: false }).catch(async error => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            await fs.mkdir(audio.root(), { recursive: true }); await fs.mkdir(directory);
          });
          for (const kind of ['original', 'analysis'] as const)
            await atomicWrite(path.join(directory, kind), await fs.readFile(inspection.members.get(`audio/${clip.id}/${kind}`)!.file));
          await atomicWrite(path.join(directory, 'metadata.json'), JSON.stringify({ id, createdAt: clip.created_at,
            original: clip.assets.original, analysis: clip.assets.analysis, duration: clip.duration, state: 'retained' }));
        } else {
          const directory = path.join(dataDir(), 'audio'); await fs.mkdir(directory, { recursive: true });
          for (const ext of ['wav', 'webm']) {
            const member = inspection.members.get(`audio/${clip.id}/legacy.${ext}`);
            if (member) await atomicWrite(path.join(directory, `${id}.${ext}`), await fs.readFile(member.file));
          }
        }
      }
    });
    // Fresh assets left by interruption are safe orphans, never overwritten shared evidence.
    // A restart sees either the old profile or the fully installed new profile via atomicWrite recovery.
    this.previews.delete(token);
    await this.remove(inspection.directory).catch(error => console.error('[archives:cleanup]', (error as Error).message));
    return { profile: result, backupId };
  }
}
