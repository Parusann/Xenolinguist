import { appendFile, mkdir, readFile, readdir, writeFile, realpath, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { ollamaJson, requireLocalModel } from '../../../server/src/services/ollama-runtime.js';
import { createCorpus, digest } from './corpus.js';
import { independentControls } from './archive.js';
import { learnerView, type PrivateEpisode } from './contracts.js';
import { lookup, surfaceHeuristic } from './baselines.js';
import { runModel, type ModelConfig, type ModelResult, type Transport } from './model.js';
import { scoreEpisode, summarizeItems, type Outcome, type ItemScore } from './score.js';
import { performanceSummary } from '../metrics/performance.js';
import { sha256 } from './wold.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const methodsSchema = z.array(z.enum(['lookup', 'surface', 'model', 'model-tools'])).min(1).max(4).refine(m => new Set(m).size === m.length);
export type Method = z.infer<typeof methodsSchema>[number];
type Cohort = 'development' | 'controls';
type Cell = { sequence: number; cohort: Cohort; episodeId: string; method: Method };
type RecordRow = Cell & { inputHash: string; outcome: Outcome; scores: ItemScore[]; durationMs: number; nodeRssBytes: number;
  trace: unknown; outputTokens: number; promptTokens: number; toolCalls: number };
const outcomeSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('complete'), response: z.unknown() }),
  z.strictObject({ status: z.enum(['error', 'timeout']), message: z.string().optional() }),
]);
const rowSchema = z.strictObject({ sequence: z.number().int().nonnegative(), cohort: z.enum(['development', 'controls']),
  episodeId: z.string(), method: z.enum(['lookup', 'surface', 'model', 'model-tools']), inputHash: z.string(), outcome: outcomeSchema,
  scores: z.array(z.unknown()), durationMs: z.number().nonnegative(), nodeRssBytes: z.number().int().nonnegative(),
  trace: z.unknown(), outputTokens: z.number().int().nonnegative(), promptTokens: z.number().int().nonnegative(), toolCalls: z.number().int().nonnegative() });

async function cases() {
  return [...createCorpus('development').map(episode => ({ cohort: 'development' as const, episode })),
    ...(await independentControls()).map(episode => ({ cohort: 'controls' as const, episode }))];
}
function schedule(data: Awaited<ReturnType<typeof cases>>, methods: Method[]): Cell[] {
  const cells: Cell[] = [];
  for (const [index, { cohort, episode }] of data.entries()) {
    const offset = index % methods.length;
    for (const method of [...methods.slice(offset), ...methods.slice(0, offset)])
      cells.push({ sequence: cells.length, cohort, episodeId: episode.learner.id, method });
  }
  return cells;
}

async function snapshot(directory: string) {
  const files = ['package.json', 'package-lock.json', 'tsconfig.base.json', 'evaluation/tsconfig.json',
    'evaluation/src/generator/prng.ts', 'evaluation/src/metrics/performance.ts', 'server/src/config.ts',
    'server/src/services/ollama-runtime.ts', 'server/src/services/runtime-error.ts', 'shared/schemas/capabilities.ts'];
  const walk = async (relative: string) => {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = relative + '/' + entry.name;
      if (entry.isDirectory()) await walk(name); else if (entry.isFile()) files.push(name);
    }
  };
  for (const tree of ['evaluation/src/decipherment', 'evaluation/fixtures/reference/wold-pilot', 'evaluation/protocols']) await walk(tree);
  files.push('evaluation/fixtures/decipherment-controls.json', 'evaluation/fixtures/decipherment-corpus-lock.json');
  const recorded = [];
  for (const relative of files.sort()) {
    const bytes = await readFile(path.join(root, relative)), target = path.join(directory, 'source', relative);
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' });
    recorded.push({ path: relative, sha256: sha256(bytes) });
  }
  return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), files: recorded };
}

export function summarizeStudy(records: RecordRow[], data: Awaited<ReturnType<typeof cases>>) {
  const grouped = (key: (r: RecordRow) => string) => Object.fromEntries([...new Set(records.map(key))].sort().map(group => {
    const rows = records.filter(r => key(r) === group);
    return [group, { ...summarizeItems(rows.flatMap(r => r.scores)), episodes: rows.length, latency: performanceSummary(rows.map(r => r.durationMs)),
      outputTokens: rows.reduce((n, r) => n + r.outputTokens, 0), promptTokens: rows.reduce((n, r) => n + r.promptTokens, 0), toolCalls: rows.reduce((n, r) => n + r.toolCalls, 0),
      nodeRssSampleMaxBytes: Math.max(...rows.map(r => r.nodeRssBytes)) }];
  }));
  const episode = (r: RecordRow): PrivateEpisode => data.find(d => d.cohort === r.cohort && d.episode.learner.id === r.episodeId)!.episode;
  const truthGroups: Record<string, ReturnType<typeof summarizeItems>> = {};
  for (const cohort of ['development', 'controls']) for (const method of [...new Set(records.map(r => r.method))]) for (const status of ['identified', 'ambiguous', 'insufficient']) {
    const items = records.filter(r => r.cohort === cohort && r.method === method).flatMap(r => r.scores).filter(i => i.truthStatus === status);
    truthGroups[[cohort, method, status].join('/') ] = summarizeItems(items);
  }
  return { records: records.length, byMethod: grouped(r => r.cohort + '/' + r.method),
    byTask: grouped(r => [r.cohort, r.method, episode(r).learner.task].join('/')),
    byMechanism: grouped(r => [r.cohort, r.method, episode(r).provenance.mechanisms.join('+')].join('/')),
    byLineage: grouped(r => [r.cohort, r.method, episode(r).provenance.lineage].join('/')), byTruth: truthGroups };
}

function report(summary: ReturnType<typeof summarizeStudy>) {
  const pct = (n: number | null) => n === null ? 'n/a' : (100 * n).toFixed(1) + '%';
  const lines = ['# Bounded decipherment baseline study', '',
    '| Cohort / method | Identified accuracy | Answer coverage | Uncertainty success | False claims | Failed items | Median ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const [method, r] of Object.entries(summary.byMethod)) lines.push(`| ${method} | ${pct(r.identifiedAccuracy)} | ${pct(r.identifiedAnswerCoverage)} | ${pct(r.uncertaintySuccess)} | ${r.falseClaims}/${r.scheduled} | ${r.failures} | ${r.latency.medianMs?.toFixed(1)} |`);
  lines.push('', 'Development and independent software controls are reported separately. No reserved evaluation was run. These supplied finite rule classes do not demonstrate unrestricted language decipherment.', '',
    'Lookup memorizes exact demonstrations. Surface heuristics use greedy boundaries, inventory elimination, context-free aligned symbol maps and the first consistent affix decomposition. They are deliberately simple controls, not exhaustive identifiability solvers.', '',
    'Model and model-tools use the same evidence, priors, temperature, seed, context and total generated-token/time budgets. Tool checks consume that shared budget. Serial method order rotates by episode; cold loads are retained. One model seed and eight development lineages do not establish statistical superiority.', '',
    'Node RSS is sampled after each episode and is not peak system or GPU memory. Model allocation snapshots, when available, are stored separately in manifest.json. Token totals and full requests/responses are retained in records.jsonl. The existing supplied-grammar-prior translation benchmark has a different task contract and remains a separately reported control.', '');
  return lines.join('\n');
}

export async function runStudy(methods: Method[], directory: string, model?: ModelConfig, transport?: Transport) {
  methodsSchema.parse(methods);
  if (methods.some(m => m.startsWith('model')) && !model) throw new Error('Model configuration is required');
  const data = await cases(), cells = schedule(data, methods);
  await mkdir(directory, { recursive: false });
  const source = await snapshot(directory), records: RecordRow[] = [];
  const manifest = { format: 'decipherment-study-1', methods, model: model ?? null, corpusHash: digest(data), schedule: cells, source,
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
    startedAt: new Date().toISOString(), runtime: null as unknown, allocationsAfterRun: null as unknown };
  const save = (state: unknown) => writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ ...manifest, ...(state as object) }, null, 2) + '\n');
  await save({ status: 'running' });
  await writeFile(path.join(directory, 'records.jsonl'), '', { flag: 'wx' });
  try {
    if (model && !transport) manifest.runtime = await ollamaJson('/api/version');
    for (const cell of cells) {
      const e = data.find(d => d.cohort === cell.cohort && d.episode.learner.id === cell.episodeId)!.episode;
      const input = learnerView(e), started = performance.now();
      const result = cell.method === 'lookup' || cell.method === 'surface' ? {
        outcome: { status: 'complete' as const, response: (cell.method === 'lookup' ? lookup : surfaceHeuristic)(input) }, trace: null,
      } : await runModel(input, cell.method === 'model-tools', model!, transport);
      const row: RecordRow = { ...cell, inputHash: digest(input), outcome: result.outcome,
        scores: scoreEpisode(e, result.outcome), durationMs: performance.now() - started, nodeRssBytes: process.memoryUsage().rss,
        trace: result.trace, outputTokens: result.trace?.outputTokens ?? 0, promptTokens: result.trace?.promptTokens ?? 0, toolCalls: result.trace?.toolChecks.length ?? 0 };
      records.push(row); await appendFile(path.join(directory, 'records.jsonl'), JSON.stringify(row) + '\n');
      if (!transport) console.log(`${cell.sequence + 1}/${cells.length} ${cell.cohort}/${cell.episodeId}/${cell.method} ${row.outcome.status} ${Math.round(row.durationMs)}ms`);
    }
    if (model && !transport) {
      try { manifest.allocationsAfterRun = await ollamaJson('/api/ps'); }
      catch (error) { manifest.allocationsAfterRun = { error: error instanceof Error ? error.message : String(error) }; }
    }
    const summary = summarizeStudy(records, data);
    await writeFile(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
    await writeFile(path.join(directory, 'report.md'), report(summary), { flag: 'wx' });
    const outputFiles = [];
    for (const name of ['records.jsonl', 'summary.json', 'report.md']) outputFiles.push({ path: name, sha256: sha256(await readFile(path.join(directory, name))) });
    await save({ status: 'complete', finishedAt: new Date().toISOString(), outputFiles });
    await verifyStudy(directory);
    return summary;
  } catch (error) {
    await save({ status: 'failed', completedRecords: records.length, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function verifyStudy(directory: string) {
  const base = await realpath(directory);
  const read = async (relative: string) => {
    const candidate = path.join(base, relative), resolved = await realpath(candidate), rel = path.relative(base, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel) || (await lstat(candidate)).isSymbolicLink()) throw new Error('Archive path escapes root or is a link');
    return readFile(resolved);
  };
  const manifest = JSON.parse((await read('manifest.json')).toString('utf8'));
  if (manifest.format !== 'decipherment-study-1' || manifest.status !== 'complete') throw new Error('Incomplete study');
  const methods = methodsSchema.parse(manifest.methods), data = await cases(), cells = schedule(data, methods);
  if (digest(data) !== manifest.corpusHash || digest(cells) !== digest(manifest.schedule)) throw new Error('Study corpus or schedule changed');
  const sourcePaths = manifest.source.files.map((f: { path: string }) => f.path);
  if (new Set(sourcePaths).size !== sourcePaths.length ||
      !['package-lock.json', 'evaluation/src/decipherment/model.ts', 'evaluation/src/decipherment/score.ts', 'evaluation/src/decipherment/corpus.ts', 'evaluation/src/decipherment/reference.ts', 'evaluation/src/decipherment/baselines.ts'].every(p => sourcePaths.includes(p))) throw new Error('Source manifest is incomplete');
  for (const file of manifest.source.files) if (sha256(await read('source/' + file.path)) !== file.sha256) throw new Error('Source snapshot hash mismatch');
  if (new Set(manifest.outputFiles.map((f: { path: string }) => f.path)).size !== 3 || manifest.outputFiles.length !== 3 ||
      !['records.jsonl', 'summary.json', 'report.md'].every(p => manifest.outputFiles.some((f: { path: string }) => f.path === p))) throw new Error('Output manifest is incomplete');
  for (const file of manifest.outputFiles) if (sha256(await read(file.path)) !== file.sha256) throw new Error('Output hash mismatch');
  const rows = (await read('records.jsonl')).toString('utf8').trim().split('\n').map(line => rowSchema.parse(JSON.parse(line))) as RecordRow[];
  if (rows.length !== cells.length) throw new Error('Missing or extra scheduled records');
  for (const [i, row] of rows.entries()) {
    const cell = cells[i], e = data.find(d => d.cohort === cell.cohort && d.episode.learner.id === cell.episodeId)!.episode;
    if (Object.entries(cell).some(([key, value]) => row[key as keyof Cell] !== value) || row.inputHash !== digest(learnerView(e))) throw new Error('Record schedule or input mismatch');
    if (digest(row.scores) !== digest(scoreEpisode(e, row.outcome))) throw new Error('Score replay mismatch');
    if (row.outputTokens > e.learner.budgets.maxOutputTokens || row.toolCalls > e.learner.budgets.maxToolCalls) throw new Error('Recorded budget exceeded');
    if (row.method === 'lookup' || row.method === 'surface') {
      const expected = { status: 'complete', response: (row.method === 'lookup' ? lookup : surfaceHeuristic)(learnerView(e)) };
      if (digest(expected) !== digest(row.outcome) || row.trace !== null || row.outputTokens || row.promptTokens || row.toolCalls) throw new Error('Baseline replay mismatch');
    } else {
      const trace = row.trace as ModelResult['trace']; let calls = 0;
      if (!trace || !Array.isArray(trace.calls) || !manifest.model) throw new Error('Missing model trace');
      const replay = await runModel(learnerView(e), row.method === 'model-tools', manifest.model, async request => {
        const retained = trace.calls[calls++];
        if (!retained || digest(request) !== digest(retained.request)) throw new Error('Model request replay mismatch');
        if (retained.error !== undefined) throw Object.assign(new Error(retained.error), { name: retained.errorName ?? 'Error' });
        return retained.result as Record<string, any>;
      });
      if (calls !== trace.calls.length || digest(replay.outcome) !== digest(row.outcome) || digest(replay.trace) !== digest(trace) ||
          row.outputTokens !== trace.outputTokens || row.promptTokens !== trace.promptTokens || row.toolCalls !== trace.toolChecks.length) throw new Error('Model trace replay mismatch');
    }
  }
  const summary = summarizeStudy(rows, data);
  if (digest(summary) !== digest(JSON.parse((await read('summary.json')).toString('utf8'))) || report(summary) !== (await read('report.md')).toString('utf8')) throw new Error('Summary replay mismatch');
  return { passed: true, records: rows.length, corpusHash: manifest.corpusHash };
}

async function main(args: string[]) {
  if (args.length === 2 && args[0] === 'verify') return verifyStudy(args[1]);
  if (args.length !== 2 || !['controls', 'local-model'].includes(args[0])) throw new Error('Usage: study.ts <controls|local-model|verify> <new-directory-or-archive>');
  if (args[0] === 'controls') return runStudy(['lookup', 'surface'], args[1]);
  const name = 'qwen3:4b-instruct-2507-q4_K_M', pinned = await requireLocalModel(name, AbortSignal.timeout(15000));
  return runStudy(['lookup', 'surface', 'model', 'model-tools'], args[1], { name, digest: pinned.digest, seed: 0, numCtx: 8192 });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main(process.argv.slice(2)).then(r => console.log(JSON.stringify('byMethod' in r ? r.byMethod : r, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
