import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { exportCorpus, verifyCorpus, independentControls } from './archive.js';
import { main } from './cli.js';
import { inferTruth } from './reference.js';
import { setKey } from './contracts.js';
import { createCorpus, digest } from './corpus.js';

it('retains the versioned corpus fingerprints', async () => {
  const lock = JSON.parse(await readFile(new URL('../../fixtures/decipherment-corpus-lock.json', import.meta.url), 'utf8'));
  for (const split of ['train', 'development', 'final'] as const) expect(digest(createCorpus(split))).toBe(lock[split]);
});

it('independently authored controls agree with the exhaustive scorer', async () => {
  for (const e of await independentControls()) {
    const inferred = inferTruth(e.learner);
    for (const truth of e.truth) {
      const actual = inferred.find(t => t.id === truth.id)!;
      expect(actual.status).toBe(truth.status);
      expect(setKey(actual.acceptable)).toBe(setKey(truth.acceptable));
    }
  }
});

it('exports separate learner/scorer records and rejects corruption, deletion, duplication and overwrite', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'decipherment-archive-')), output = path.join(temp, 'corpus');
  try {
    expect(await exportCorpus('development', output)).toMatchObject({ passed: true, episodes: 48, controls: 4 });
    await expect(exportCorpus('development', output)).rejects.toThrow();
    const file = path.join(output, 'learner/e0.json'), original = await readFile(file, 'utf8');
    expect(original).not.toContain('provenance');
    await writeFile(file, original + ' ');
    await expect(verifyCorpus(output)).rejects.toThrow('byte hash');
    await writeFile(file, original);
    const manifestFile = path.join(output, 'manifest.json'), manifestBytes = await readFile(manifestFile, 'utf8');
    const manifest = JSON.parse(manifestBytes); manifest.entries.push(manifest.entries[0]);
    await writeFile(manifestFile, JSON.stringify(manifest));
    await expect(verifyCorpus(output)).rejects.toThrow('Duplicate');
    await writeFile(manifestFile, manifestBytes);
    await rm(file);
    await expect(verifyCorpus(output)).rejects.toThrow();
  } finally { await rm(temp, { recursive: true, force: true }); }
});

it('does not materialize final evaluation records through the ordinary CLI', async () => {
  await expect(main(['export', 'final', 'unused'])).rejects.toThrow('Reserved final');
});
