import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareLexical } from '../../../engine/src/comparison/lexical.js';
import { createCorpus, digest } from './corpus.js';
import { learnerView, PROTOCOL, type Prediction } from './contracts.js';
import { scoreEpisode, summarizeItems } from './score.js';

/** Demonstrate the callable product baseline using development lineages excluded from optimization. */
export function productStudy() {
  const episodes = createCorpus('development').filter(episode => episode.learner.task === 'lexical');
  const rows = episodes.map(episode => {
    const input = learnerView(episode);
    if (input.task !== 'lexical') throw new Error('Expected lexical evidence');
    const started = performance.now();
    const proposals = input.challenges.map(challenge => ({ challengeId: challenge.id, result: compareLexical({
      assumption: 'closed-bijective-inventory', forms: input.formCandidates,
      meanings: input.meaningCandidates, anchors: input.observations, query: challenge.form,
    }) }));
    const durationMs = performance.now() - started;
    const predictions: Prediction[] = proposals.map(({ challengeId: id, result }) =>
      result.status === 'identified' ? { id, kind: 'answer', value: result.meanings, confidence: 0.5, evidenceIds: result.evidenceIds } :
        result.status === 'ambiguous' ? { id, kind: 'alternatives', values: result.meanings.map(meaning => [meaning]), evidenceIds: result.evidenceIds } :
          { id, kind: 'abstain', reason: 'insufficient-evidence' });
    return { input, inputHash: digest(input), lineage: episode.provenance.lineage, proposals, durationMs,
      scores: scoreEpisode(episode, { status: 'complete', response: { protocol: PROTOCOL, predictions } }) };
  });
  const scores = rows.flatMap(row => row.scores);
  return { method: 'inventory-constraints-1', split: 'development', trainingLineagesUsed: false,
    records: rows.length, lineages: new Set(rows.map(row => row.lineage)).size, metrics: summarizeItems(scores),
    confidence: 'Fixed 0.5 only for compatibility with the benchmark scorer. The product proposal does not claim calibrated confidence.',
    rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = productStudy();
  if (process.argv.length !== 3) throw new Error('Usage: product.ts <new-output-file>');
  writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
    .then(() => console.log(JSON.stringify(report.metrics, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
