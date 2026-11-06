import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { comparisonRequestSchema, datasetInputSchema, uploadInputSchema } from '../shared/schemas/atlas.js';

export const ATLAS_ORIGIN = 'http://127.0.0.1:4318';
const credential = z.strictObject({ token: z.string().regex(/^[a-f0-9]{64}$/u), id: z.uuid(), origin: z.url(), expiresAt: z.string(),
  user: z.strictObject({ id: z.uuid(), name: z.string().max(256), email: z.string().max(320) }) });
type Credential = z.infer<typeof credential>;
export type CredentialCipher = { available: () => boolean; encrypt: (value: string) => Buffer; decrypt: (bytes: Buffer) => string };

/** Main-process credential boundary. Only ciphertext reaches disk; access tokens never reach renderer JavaScript. */
export class AtlasConnection {
  constructor(readonly directory: string, readonly cipher: CredentialCipher, readonly origin = ATLAS_ORIGIN) {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error('Atlas connections require the local loopback service');
  }
  private file() { return path.join(this.directory, 'credential.bin'); }
  private async root(create = false) {
    if (create) await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let cursor = this.directory;
    while (true) {
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Credential storage cannot use links');
      const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
    }
    if (await realpath(this.directory) !== this.directory) throw new Error('Credential storage moved');
  }
  private async read(): Promise<Credential | null> {
    if (!this.cipher.available()) throw new Error('Operating-system credential encryption is unavailable.');
    try {
      await this.root(); const file = this.file(), stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192 || await realpath(file) !== file) throw new Error('Invalid credential file');
      const value = credential.parse(JSON.parse(this.cipher.decrypt(await readFile(file))));
      if (value.origin !== this.origin) throw new Error('Credential belongs to a different Atlas server');
      return value;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  private async save(value: Credential) {
    await this.root(true);
    const temporary = path.join(this.directory, randomUUID() + '.partial'), file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(this.cipher.encrypt(JSON.stringify(value))); await file.sync(); } finally { await file.close(); }
    await rename(temporary, this.file());
  }
  private async request(url: string, method: string, body?: unknown, token?: string) {
    const response = await fetch(this.origin + url, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Origin: this.origin, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }).catch(() => { throw new Error('The local Atlas service is unavailable. Start it and retry. Offline workbench editing remains available.'); });
    const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let length = 0;
    if (reader) while (true) { const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.length; if (length > 5 * 1024 * 1024) { await reader.cancel(); throw new Error('Atlas response exceeds the desktop bound'); } chunks.push(chunk.value); }
    const bytes = Buffer.concat(chunks), data = JSON.parse(bytes.toString('utf8'));
    if (!response.ok) throw new Error(response.status === 401 ? 'Reconnect this desktop with a fresh Atlas connection code.' : data.message || 'Atlas request failed.');
    return data;
  }
  async status() {
    const value = await this.read();
    return { connected: !!value && Date.parse(value.expiresAt) > Date.now(), user: value?.user ?? null, expiresAt: value?.expiresAt ?? null,
      protection: this.cipher.available() ? 'operating-system encryption' : 'unavailable' };
  }
  async connect(raw: unknown) {
    if (!this.cipher.available()) throw new Error('Operating-system credential encryption is unavailable.');
    const code = z.string().transform(value => value.replace(/[\s-]/gu, '').toLowerCase()).pipe(z.string().regex(/^[a-f0-9]{64}$/u)).parse(raw);
    const previous = await this.read();
    const data = await this.request('/api/desktop/exchange', 'POST', { code });
    const value = credential.parse({ ...data, origin: this.origin });
    if (!Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) throw new Error('Atlas issued an expired credential');
    await this.save(value);
    if (previous) await this.request('/api/desktop/disconnect', 'POST', {}, previous.token).catch(() => {});
    return this.status();
  }
  async call(raw: unknown) {
    const input = z.strictObject({ method: z.enum(['GET', 'POST']), path: z.string().max(160), body: z.unknown().optional() }).parse(raw);
    const uuid = '[a-f0-9-]{36}', patterns = { GET: new RegExp('^/api/(?:me|datasets|versions/' + uuid + '/jobs|jobs/' + uuid + ')$'),
      POST: new RegExp('^/api/(?:datasets(?:/' + uuid + '/versions)?|versions/' + uuid + '/jobs)$') };
    if (!patterns[input.method].test(input.path)) throw new Error('Atlas operation is outside the desktop connection scope');
    if (input.method === 'POST') {
      if (input.path === '/api/datasets') datasetInputSchema.parse(input.body);
      else if (input.path.endsWith('/versions')) uploadInputSchema.parse(input.body);
      else comparisonRequestSchema.parse(input.body);
    } else if (input.body !== undefined) throw new Error('GET requests cannot transfer a body');
    const value = await this.read();
    if (!value || Date.parse(value.expiresAt) <= Date.now()) throw new Error('Connect this desktop to Atlas first.');
    return this.request(input.path, input.method, input.body, value.token);
  }
  async disconnect() {
    const value = await this.read(); let revocationPending = false;
    if (value) try { await this.request('/api/desktop/disconnect', 'POST', {}, value.token); } catch { revocationPending = true; }
    await this.root().then(() => unlink(this.file())).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
    return { disconnected: true, revocationPending };
  }
}
