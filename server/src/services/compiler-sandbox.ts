import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { dataDir } from '../config.js';
import { atomicWrite } from './atomic-file.js';
import { ProfileStore } from './profile-store.js';
import { compilerRequestSchema, type CompilerView } from '../../../shared/schemas/sandbox.js';
import { entityIdSchema, timestampSchema } from '../../../shared/schemas/common.js';
import { ProfileError } from '../../../shared/schemas/errors.js';
import { normalizeAnswer } from '../../../shared/sandbox/grading.js';
import { dataset, learnerView, hash } from '../../../evaluation/src/generator/dataset.js';

const eventSchema = z.strictObject({ id: entityIdSchema, challengeId: entityIdSchema, at: timestampSchema,
  kind: z.enum(['attempt', 'reveal']), answer: z.string().max(2000) });
const privateSchema = z.strictObject({ version: z.literal(1), generatorVersion: z.literal('xeno-generator-1'),
  sessionId: entityIdSchema, seed: z.number().int().min(0).max(0xffffffff), createdAt: timestampSchema,
  datasetHash: z.string().regex(/^[a-f0-9]{64}$/), events: z.array(eventSchema).max(1000) });
export type CompilerRecord = z.infer<typeof privateSchema>;
const failure = (message: string, status = 422) => new ProfileError('COMPILER_SESSION_INVALID', message, status);
const matched = (answer: string, english: string) => normalizeAnswer(answer) === normalizeAnswer(english);

export function validateCompilerRecord(input: unknown): CompilerRecord {
  const parsed = privateSchema.safeParse(input);
  if (!parsed.success) throw failure('Unsupported or malformed compiler session; original retained');
  const record = parsed.data, data = dataset(record.seed, undefined, record.generatorVersion);
  if (record.datasetHash !== data.sha256) throw failure('Compiler session does not match its versioned dataset');
  const ids = new Set<string>(), solved = new Set<string>();
  for (const event of record.events) {
    const target = data.targets.find(t => t.id === event.challengeId);
    if (!target || ids.has(event.id) || solved.has(event.challengeId) || (event.kind === 'reveal' && event.answer !== '')
      || (event.kind === 'attempt' && !event.answer.trim())) throw failure('Invalid compiler progress');
    ids.add(event.id);
    if (event.kind === 'reveal' || matched(event.answer, target.english)) solved.add(event.challengeId);
  }
  return record;
}
/** Explicit file access only; this directory is never statically served. Records are immutable. */
export async function readCompilerRecord(id: string): Promise<CompilerRecord> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw failure('Invalid compiler snapshot identity');
  try { return validateCompilerRecord(JSON.parse(await fs.readFile(path.join(dataDir(), 'compiler-sessions', `${id}.json`), 'utf8'))); }
  catch (error) { if (error instanceof ProfileError) throw error; throw failure('Compiler snapshot unavailable; restore a complete .xeno backup'); }
}
export async function writeCompilerRecord(input: unknown, id: string = randomUUID()) {
  const record = validateCompilerRecord(input);
  if (!/^[a-f0-9-]{36}$/.test(id)) throw failure('Invalid compiler snapshot identity');
  const directory = path.join(dataDir(), 'compiler-sessions'); await fs.mkdir(directory, { recursive: true });
  await atomicWrite(path.join(directory, `${id}.json`), JSON.stringify(record)); return id;
}
export function compilerView(record: CompilerRecord, revision: number): CompilerView {
  const data = dataset(record.seed, undefined, record.generatorVersion);
  return { ...learnerView(data), sessionId: record.sessionId, revision,
    feedback: data.targets.map(target => {
      const events = record.events.filter(e => e.challengeId === target.id), attempts = events.filter(e => e.kind === 'attempt');
      const revealed = events.some(e => e.kind === 'reveal');
      const firstReveal = record.events.findIndex(e => e.kind === 'reveal');
      const assisted = firstReveal >= 0 && attempts.some(e => record.events.indexOf(e) > firstReveal);
      return { challengeId: target.id, attempts: attempts.length, matched: attempts.some(e => matched(e.answer, target.english)), revealed, assisted,
        ...(revealed ? { answer: target.english } : {}), ...(attempts.length ? { lastAnswer: attempts.at(-1)!.answer } : {}) };
    }) };
}
export class CompilerSandbox {
  constructor(private readonly profiles = new ProfileStore()) {}
  async get(id: string) {
    const profile = await this.profiles.get(id);
    if (!profile) throw new ProfileError('PROFILE_MISSING', 'Project not found', 404);
    return profile.compiler_session_id ? compilerView(await readCompilerRecord(profile.compiler_session_id), profile.revision) : null;
  }
  async act(id: string, input: unknown) {
    const request = compilerRequestSchema.parse(input);
    const profile = await this.profiles.commitCompiler(id, request.expectedRevision, request.requestId, hash({ compiler: request }), async current => {
      if (!current.is_sandbox) throw failure('Open a sandbox project to start validated practice', 400);
      if (request.type === 'start') {
        const seed = randomBytes(4).readUInt32LE();
        return writeCompilerRecord({ version: 1, generatorVersion: 'xeno-generator-1', sessionId: randomUUID(), seed,
          createdAt: new Date().toISOString(), datasetHash: dataset(seed).sha256, events: [] });
      }
      if (!current.compiler_session_id) throw failure('No validated practice session', 409);
      const record = await readCompilerRecord(current.compiler_session_id);
      if (record.sessionId !== request.sessionId) throw failure('Practice session changed; reload before continuing', 409);
      if (request.type === 'close') return null;
      const target = dataset(record.seed).targets.find(t => t.id === request.challengeId);
      if (!target || record.events.some(e => e.challengeId === target.id && (e.kind === 'reveal' || matched(e.answer, target.english))))
        throw failure('Unknown or already resolved challenge', 409);
      if (record.events.length >= 1000) throw failure('Practice event limit reached; start another session', 409);
      record.events.push({ id: request.requestId, challengeId: request.challengeId, at: new Date().toISOString(),
        kind: request.type, answer: request.type === 'attempt' ? request.answer : '' });
      return writeCompilerRecord(record);
    });
    return { profile, view: profile.compiler_session_id ? compilerView(await readCompilerRecord(profile.compiler_session_id), profile.revision) : null };
  }
}
