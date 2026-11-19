import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { runStudy, verifyStudy } from './study.js';

it('retains every scheduled failure and verifies scores, source and output bytes', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'decipherment-study-')), directory = path.join(temp, 'run');
  try {
    const summary = await runStudy(['lookup', 'surface', 'model'], directory, { name: 'fixture', digest: 'fixture', seed: 0, numCtx: 8192 }, async () => { throw new Error('Deliberate fixture failure'); });
    expect(summary.records).toBe(156);
    expect(summary.byMethod['development/model'].scheduled).toBe(104);
    expect(summary.byMethod['development/model'].failures).toBe(104);
    expect(await verifyStudy(directory)).toMatchObject({ passed: true, records: 156 });
    await expect(runStudy(['lookup'], directory)).rejects.toThrow();
    const output = path.join(directory, 'summary.json'), original = await readFile(output, 'utf8');
    await writeFile(output, original + ' '); await expect(verifyStudy(directory)).rejects.toThrow('Output hash');
    await writeFile(output, original);
    await writeFile(path.join(directory, 'source/evaluation/src/decipherment/score.ts'), 'changed');
    await expect(verifyStudy(directory)).rejects.toThrow('Source snapshot');
  } finally { await rm(temp, { recursive: true, force: true }); }
}, 20000);
