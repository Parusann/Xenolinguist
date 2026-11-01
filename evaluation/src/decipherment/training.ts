import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCorpus, CORPUS_VERSION } from './corpus.js';
import { learnerView, PROTOCOL, type Prediction } from './contracts.js';
import { structuredPrompt, PROMPT_VERSION } from './model.js';
import { scoreEpisode } from './score.js';

export async function exportLexicalTraining(directory: string) {
  // The caller cannot select evaluation splits, reference data, or user submissions.
  const episodes = createCorpus('train').filter(e => e.learner.task === 'lexical');
  const groups = [true, false].map(identified => episodes.filter(e => e.truth.some(t => t.status === 'identified') === identified));
  if (groups[0].length !== groups[1].length) throw new Error('Unbalanced lexical training schedule');
  const balanced = groups[0].flatMap((e, i) => [e, groups[1][i]]);
  const rows = balanced.map(e => {
    if (e.provenance.source !== 'synthetic' || e.provenance.split !== 'train') throw new Error('Unexpected training provenance');
    const learner = learnerView(e);
    const predictions: Prediction[] = e.truth.map(t => t.status === 'identified'
      ? { id: t.id, kind: 'answer', value: t.acceptable[0], confidence: 1, evidenceIds: learner.observations.map(o => o.id) }
      : { id: t.id, kind: 'abstain', reason: t.status === 'ambiguous' ? 'ambiguity' : 'insufficient-evidence' });
    const response = { protocol: PROTOCOL, predictions };
    if (scoreEpisode(e, { status: 'complete', response }).some(s => !s.success || s.falseClaim)) throw new Error('Unsupported training target');
    return { messages: [...structuredPrompt(learner, false), { role: 'assistant', content: JSON.stringify({ kind: 'final', response }) }] };
  });
  const bytes = rows.map(r => JSON.stringify(r) + '\n').join('');
  const manifest = { format: 'lexical-supervision-1', corpus: CORPUS_VERSION, prompt: PROMPT_VERSION,
    source: 'synthetic', split: 'train', episodes: rows.length, lineages: new Set(episodes.map(e => e.provenance.lineage)).size,
    supportedTargets: episodes.reduce((n, e) => n + e.truth.length, 0), sha256: createHash('sha256').update(bytes).digest('hex'),
    order: balanced.map(e => ({ id: e.learner.id, lineage: e.provenance.lineage })) };
  await mkdir(directory, { recursive: false });
  await writeFile(path.join(directory, 'examples.jsonl'), bytes, { flag: 'wx' });
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error('Usage: training.ts <new-output-directory>');
  exportLexicalTraining(process.argv[2]).then(({ order, ...summary }) => console.log(JSON.stringify(summary, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
