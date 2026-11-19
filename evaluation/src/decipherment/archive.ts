import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PROTOCOL, learnerView, privateEpisodeSchema, type PrivateEpisode } from './contracts.js';
import { CORPUS_VERSION, createCorpus, digest, type Split } from './corpus.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.strictObject({
  format: z.literal('decipherment-archive-1'), protocol: z.literal(PROTOCOL),
  corpusVersion: z.literal(CORPUS_VERSION), split: z.enum(['train', 'development']),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), trackedDirty: z.boolean(),
  nodeVersion: z.string(), corpusHash: sha, controlsHash: sha,
  entries: z.array(z.strictObject({ id: z.string().regex(/^e[0-9]+$/), learnerSha256: sha, scorerSha256: sha })).min(1).max(10000),
  controls: z.array(z.strictObject({ id: z.string().regex(/^control-[a-z]+$/), learnerSha256: sha, scorerSha256: sha })).length(4),
});

export async function independentControls(): Promise<PrivateEpisode[]> {
  const raw: unknown = JSON.parse(await readFile(path.join(root, 'evaluation/fixtures/decipherment-controls.json'), 'utf8'));
  return z.array(privateEpisodeSchema).length(4).parse(raw);
}

export async function exportCorpus(split: Exclude<Split, 'final'>, directory: string) {
  if (!['train', 'development'].includes(split)) throw new Error('Reserved final export is not enabled before the evaluation gate');
  const episodes = createCorpus(split), controls = await independentControls();
  await mkdir(path.dirname(path.resolve(directory)), { recursive: true });
  await mkdir(directory, { recursive: false });
  for (const sub of ['learner', 'scorer', 'controls/learner', 'controls/scorer']) await mkdir(path.join(directory, sub), { recursive: true });
  const writePair = async (e: PrivateEpisode, prefix: string) => {
    const learner = JSON.stringify(learnerView(e)) + '\n', scorer = JSON.stringify(e) + '\n';
    await writeFile(path.join(directory, prefix, 'learner', e.learner.id + '.json'), learner, { flag: 'wx' });
    await writeFile(path.join(directory, prefix, 'scorer', e.learner.id + '.json'), scorer, { flag: 'wx' });
    return { id: e.learner.id, learnerSha256: hash(learner), scorerSha256: hash(scorer) };
  };
  const entries = [], controlEntries = [];
  for (const e of episodes) entries.push(await writePair(e, ''));
  for (const e of controls) controlEntries.push(await writePair(e, 'controls'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const manifest = manifestSchema.parse({
    format: 'decipherment-archive-1', protocol: PROTOCOL, corpusVersion: CORPUS_VERSION, split,
    sourceCommit: git('rev-parse', 'HEAD'), trackedDirty: !!git('status', '--porcelain', '--untracked-files=no'),
    nodeVersion: process.version, corpusHash: digest(episodes), controlsHash: digest(controls),
    entries, controls: controlEntries,
  });
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return verifyCorpus(directory);
}

/** Verify bytes, projection, schedule and deterministic regeneration. Hashes are not signatures. */
export async function verifyCorpus(directory: string) {
  const base = await realpath(directory);
  const readContained = async (relative: string) => {
    const file = path.join(base, relative), resolved = await realpath(file);
    const rel = path.relative(base, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel) || (await lstat(file)).isSymbolicLink())
      throw new Error('Archive file escapes root or is a link');
    return readFile(resolved, 'utf8');
  };
  const manifest = manifestSchema.parse(JSON.parse(await readContained('manifest.json')));
  const episodes: PrivateEpisode[] = [], controls: PrivateEpisode[] = [];
  for (const [entries, prefix, records] of [
    [manifest.entries, '', episodes], [manifest.controls, 'controls', controls],
  ] as const) {
    if (new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('Duplicate manifest entries');
    for (const entry of entries) {
      const learner = await readContained(path.join(prefix, 'learner', entry.id + '.json'));
      const scorer = await readContained(path.join(prefix, 'scorer', entry.id + '.json'));
      if (hash(learner) !== entry.learnerSha256 || hash(scorer) !== entry.scorerSha256) throw new Error('Archive byte hash mismatch');
      const episode = privateEpisodeSchema.parse(JSON.parse(scorer));
      if (episode.learner.id !== entry.id || digest(JSON.parse(learner)) !== digest(learnerView(episode)))
        throw new Error('Learner/scorer projection mismatch');
      records.push(episode);
    }
  }
  if (digest(episodes) !== manifest.corpusHash || digest(createCorpus(manifest.split)) !== manifest.corpusHash)
    throw new Error('Corpus differs from declared deterministic schedule');
  if (digest(controls) !== manifest.controlsHash || digest(await independentControls()) !== manifest.controlsHash)
    throw new Error('Independent controls changed');
  return { passed: true, split: manifest.split, episodes: episodes.length, controls: controls.length,
    corpusHash: manifest.corpusHash, controlsHash: manifest.controlsHash };
}
