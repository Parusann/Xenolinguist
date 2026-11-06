import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { requireLocalModel, localOllamaUrl, ollamaJson } from '../../../server/src/services/ollama-runtime.js';
import { createCorpus, digest } from './corpus.js';
import { independentControls } from './archive.js';
import { snapshot } from './study.js';
import { learnerView, responseSchema, type PrivateEpisode } from './contracts.js';
import { runModel, type ModelConfig, type ModelResult } from './model.js';
import { scoreEpisode, summarizeItems, type ItemScore } from './score.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const tag = z.strictObject({ name: z.string().regex(/^xeno-lexical-(?:base|candidate):[a-z0-9-]+$/), digest: sha });
const sealSchema = z.strictObject({ format: z.literal('lexical-pair-v1'), recipeHash: sha, adapterHash: sha,
  baseRevision: z.literal('cdbee75f17c01a7cc42f958dc650907174af0554'), base: tag, candidate: tag,
  optionsHash: sha, templateHash: sha, quantization: z.string().min(1), ollamaVersion: z.string().min(1) });
type Seal = z.infer<typeof sealSchema>;
type Arm = 'base' | 'candidate';
type Split = 'development' | 'final';
type Row = { arm: Arm; episodeId: string; inputHash: string; durationMs: number; result: ModelResult; scores: ItemScore[] };
type Groups = { lexical: ItemScore[]; transfer: ItemScore[] };

/** Frozen thresholds in lexical-adapter-gates-v1.md. Missing items remain in the denominator. */
export function decision(base: Groups, candidate: Groups) {
  for (const group of [base, candidate]) {
    if (group.lexical.length !== 32 || group.transfer.length !== 72 ||
        group.lexical.filter(x => x.truthStatus === 'identified').length !== 8 ||
        group.lexical.filter(x => x.truthStatus === 'ambiguous').length !== 8) throw new Error('Incomplete gate denominator');
  }
  const correct = (xs: ItemScore[], identified: boolean) => xs.filter(x => x.success && (x.truthStatus === 'identified') === identified).length;
  const falseClaims = (xs: ItemScore[]) => xs.filter(x => x.falseClaim).length;
  const failures = (xs: ItemScore[]) => summarizeItems(xs).failures;
  const checks = {
    identified: correct(candidate.lexical, true) >= 6 && correct(candidate.lexical, true) - correct(base.lexical, true) >= 4,
    uncertainty: correct(candidate.lexical, false) >= 22,
    falseClaims: !candidate.lexical.some(x => x.truthStatus !== 'identified' && x.outcome === 'answer' && x.falseClaim) && falseClaims(candidate.lexical) <= 1,
    validity: failures(candidate.lexical) <= 1,
    transfer: falseClaims(candidate.transfer) <= falseClaims(base.transfer) + 2 && failures(candidate.transfer) <= failures(base.transfer) + 2,
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

function settings(seal: Seal, arm: Arm): ModelConfig {
  return { ...seal[arm], promptVersion: 'decipherment-prompt-2', seed: 0, numCtx: 8192 };
}

function summary(rows: Row[], data: PrivateEpisode[], split: Split) {
  const groups: Record<Arm, Groups> = { base: { lexical: [], transfer: [] }, candidate: { lexical: [], transfer: [] } };
  const breakdown: Record<string, ItemScore[]> = {};
  for (const row of rows) {
    const episode = data.find(e => e.learner.id === row.episodeId)!;
    groups[row.arm][episode.learner.task === 'lexical' ? 'lexical' : 'transfer'].push(...row.scores);
    for (const key of [row.arm, `${row.arm}/task/${episode.learner.task}`, `${row.arm}/lineage/${episode.provenance.lineage}`,
      `${row.arm}/lineage/${episode.provenance.lineage}/${episode.learner.task}`]) (breakdown[key] ??= []).push(...row.scores);
  }
  const runtime = Object.fromEntries((['base', 'candidate'] as const).map(arm => {
    const armRows = rows.filter(row => row.arm === arm);
    return [arm, { episodes: armRows.length, totalMs: armRows.reduce((s, r) => s + r.durationMs, 0),
      completedRequests: armRows.filter(r => r.result.trace.calls.some(c => c.result !== undefined)).length,
      promptTokens: armRows.reduce((s, r) => s + r.result.trace.promptTokens, 0),
      outputTokens: armRows.reduce((s, r) => s + r.result.trace.outputTokens, 0) }];
  }));
  return { split, scheduleRecords: rows.length, gates: decision(groups.base, groups.candidate),
    runtime,
    metrics: Object.fromEntries(Object.entries(breakdown).map(([key, items]) => {
      const identified = items.filter(i => i.truthStatus === 'identified');
      const uncertain = items.filter(i => i.truthStatus !== 'identified');
      return [key, { ...summarizeItems(items), identified: identified.length, identifiedCorrect: identified.filter(i => i.success).length,
        uncertain: uncertain.length, uncertainCorrect: uncertain.filter(i => i.success).length }];
    })) };
}

async function validateRecipe(seal: Seal) {
  const recipe = await readFile(path.join(root, 'evaluation/protocols/lexical-candidate-recipe-v1.json'), 'utf8');
  if (digest(JSON.parse(recipe)) !== seal.recipeHash || seal.base.digest === seal.candidate.digest ||
      seal.base.name !== 'xeno-lexical-base:' + seal.baseRevision.slice(0, 16) ||
      seal.candidate.name !== 'xeno-lexical-candidate:' + seal.adapterHash.slice(0, 16))
    throw new Error('Paired artifacts or recipe mismatch');
}

async function validateRuntime(seal: Seal) {
  if (localOllamaUrl() !== 'http://127.0.0.1:11435') throw new Error('Expected dedicated research endpoint');
  if ((await ollamaJson('/api/version')).version !== seal.ollamaVersion) throw new Error('Ollama version changed');
  for (const arm of ['base', 'candidate'] as const) {
    const model = await requireLocalModel(seal[arm].name, AbortSignal.timeout(10000));
    const show = await ollamaJson('/api/show', { model: model.name });
    if (model.digest !== seal[arm].digest || digest(show.template) !== seal.templateHash ||
        digest(show.parameters ?? '') !== seal.optionsHash || show.details?.quantization_level !== seal.quantization) throw new Error('Paired runtime mismatch');
  }
}

async function sealImports(directory: string) {
  const imported = JSON.parse(await readFile(path.join(directory, 'imports.json'), 'utf8'));
  const base = await ollamaJson('/api/show', { model: imported.base.name });
  const candidate = await ollamaJson('/api/show', { model: imported.candidate.name });
  if (!base.template || base.license !== candidate.license || !base.license?.includes('Apache License') ||
      !['BF16', 'F16', 'F32'].includes(base.details?.quantization_level)) throw new Error('Unsupported import precision, template or license');
  // Import staging uses identical upstream architecture and tokenizer files. Reject divergent runtime metadata as well.
  const metadata = (info: Record<string, any>) => Object.fromEntries(Object.entries(info.model_info)
    .filter(([key]) => !['general.name', 'general.basename'].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
  if (digest(metadata(base)) !== digest(metadata(candidate))) throw new Error('Runtime architecture or tokenizer differs');
  const seal = sealSchema.parse({ format: 'lexical-pair-v1', recipeHash: digest(imported.recipe), adapterHash: imported.adapterHash,
    baseRevision: imported.baseRevision, base: imported.base, candidate: imported.candidate, optionsHash: digest(base.parameters ?? ''),
    templateHash: digest(base.template), quantization: base.details.quantization_level, ollamaVersion: imported.ollamaVersion });
  await validateRecipe(seal);
  await validateRuntime(seal);
  const [control] = await independentControls();
  const controlChecks = [];
  for (const arm of ['base', 'candidate'] as const) {
    await warmModel(seal[arm].name);
    const trial = await runModel(learnerView(control), false, settings(seal, arm));
    controlChecks.push({ arm, input: learnerView(control), result: trial });
    await writeFile(path.join(directory, `control-check-${arm}.json`), JSON.stringify(controlChecks.at(-1), null, 2) + '\n', { flag: 'wx' });
    if (trial.outcome.status !== 'complete' || !responseSchema.safeParse(trial.outcome.response).success)
      throw new Error(`Independent ${arm} runtime check did not return a valid response`);
  }
  await writeFile(path.join(directory, 'control-checks.json'), JSON.stringify(controlChecks, null, 2) + '\n', { flag: 'wx' });
  await writeFile(path.join(directory, 'pair.json'), JSON.stringify(seal, null, 2) + '\n', { flag: 'wx' });
  return seal;
}

async function warmModel(name: string) {
  const response = await fetch(localOllamaUrl() + '/api/generate', { method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
    body: JSON.stringify({ model: name, options: { num_ctx: 8192 }, keep_alive: '10m', stream: false }) });
  if (!response.ok || !(await response.json()).done) throw new Error('Model preload failed for ' + name);
}

async function evaluate(split: Split, seal: Seal, directory: string) {
  await validateRecipe(seal); await validateRuntime(seal);
  const data = createCorpus(split);
  const cells = (['base', 'candidate'] as const).flatMap(arm => data.map(e => ({ arm, episodeId: e.learner.id })));
  // mkdir is the irreversible evaluation gate. A partial reserved run also consumes it.
  await mkdir(directory, { recursive: false });
  const manifest = { format: 'lexical-comparison-v1', split, seal, corpusHash: digest(data), schedule: cells,
    preload: 'empty generate before each arm, 8192 context, outside episode budget',
    source: await snapshot(directory),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), started: new Date().toISOString() };
  const output = path.join(directory, 'records.jsonl');
  const preloadsFile = path.join(directory, 'preloads.jsonl');
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  await writeFile(output, '', { flag: 'wx' });
  await writeFile(preloadsFile, '', { flag: 'wx' });
  const rows: Row[] = [];
  for (const cell of cells) {
    if (!rows.length || rows.at(-1)!.arm !== cell.arm) {
      const started = performance.now();
      await warmModel(seal[cell.arm].name);
      await appendFile(preloadsFile, JSON.stringify({ arm: cell.arm, durationMs: performance.now() - started,
        allocation: await ollamaJson('/api/ps') }) + '\n');
    }
    const e = data.find(e => e.learner.id === cell.episodeId)!, input = learnerView(e);
    const started = performance.now();
    const result = await runModel(input, false, settings(seal, cell.arm));
    const row = { ...cell, inputHash: digest(input), durationMs: performance.now() - started, result, scores: scoreEpisode(e, result.outcome) };
    rows.push(row); await appendFile(output, JSON.stringify(row) + '\n');
    if (rows.length % 8 === 0) console.log(`${rows.length}/${cells.length} ${split} ${cell.arm}`);
  }
  await validateRuntime(seal);
  const result = summary(rows, data, split);
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  await writeFile(path.join(directory, 'complete.json'), JSON.stringify({ recordsHash: hash(await readFile(output)),
    preloadsHash: hash(await readFile(preloadsFile)), summaryHash: digest(result), manifestHash: digest(manifest) }) + '\n', { flag: 'wx' });
  return verify(directory);
}

export async function verify(directory: string) {
  const read = (name: string) => readFile(path.join(directory, name), 'utf8');
  const manifest = JSON.parse(await read('manifest.json')), complete = JSON.parse(await read('complete.json'));
  const split = z.enum(['development', 'final']).parse(manifest.split), seal = sealSchema.parse(manifest.seal);
  await validateRecipe(seal);
  const data = createCorpus(split), cells = (['base', 'candidate'] as const).flatMap(arm => data.map(e => ({ arm, episodeId: e.learner.id })));
  const bytes = await readFile(path.join(directory, 'records.jsonl'));
  const preloads = await readFile(path.join(directory, 'preloads.jsonl'));
  if (manifest.format !== 'lexical-comparison-v1' || digest(manifest) !== complete.manifestHash || digest(data) !== manifest.corpusHash ||
      digest(cells) !== digest(manifest.schedule) || hash(bytes) !== complete.recordsHash ||
      hash(preloads) !== complete.preloadsHash) throw new Error('Comparison integrity failure');
  const loads = preloads.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
  if (loads.length !== 2 || loads[0].arm !== 'base' || loads[1].arm !== 'candidate') throw new Error('Incomplete preload record');
  for (const entry of manifest.source.files) {
    const file = path.resolve(directory, 'source', entry.path);
    if (!file.startsWith(path.resolve(directory, 'source') + path.sep) ||
        hash(await readFile(file)) !== entry.sha256) throw new Error('Comparison source snapshot differs');
  }
  const rows: Row[] = bytes.toString('utf8').trim().split('\n').map(s => JSON.parse(s));
  if (rows.length !== cells.length) throw new Error('Comparison schedule incomplete');
  for (const [index, row] of rows.entries()) {
    const cell = cells[index], e = data.find(e => e.learner.id === cell.episodeId)!, input = learnerView(e);
    if (row.arm !== cell.arm || row.episodeId !== cell.episodeId || row.inputHash !== digest(input) ||
        !Number.isFinite(row.durationMs) || row.durationMs < 0) throw new Error('Comparison input or duration mismatch');
    let calls = 0;
    const replay = await runModel(input, false, settings(seal, row.arm), async request => {
      const call = row.result.trace.calls[calls++];
      if (!call || digest(call.request) !== digest(request)) throw new Error('Request differs from visible episode');
      if (call.error !== undefined) throw Object.assign(new Error(call.error), { name: call.errorName });
      return call.result as Record<string, any>;
    });
    if (calls !== row.result.trace.calls.length || digest(replay) !== digest(row.result) ||
        digest(row.scores) !== digest(scoreEpisode(e, replay.outcome))) throw new Error('Paired trace or score replay mismatch');
  }
  const result = summary(rows, data, split);
  if (digest(result) !== complete.summaryHash || digest(result) !== digest(JSON.parse(await read('summary.json')))) throw new Error('Comparison summary mismatch');
  return { passed: true, records: rows.length, split, gates: result.gates };
}

async function main(args: string[]) {
  if (args.length === 2 && args[0] === 'verify') return verify(args[1]);
  if (args.length === 2 && args[0] === 'seal') return sealImports(args[1]);
  const research = process.env.XENO_RESEARCH_RESULTS;
  if (!research || args.length !== 2) throw new Error('Usage: paired.ts <development|final> <seal-file> | verify <directory>');
  const split = z.enum(['development', 'final']).parse(args[0]);
  const seal = sealSchema.parse(JSON.parse(await readFile(args[1], 'utf8')));
  const directory = path.join(research, 'lexical-candidate-v1-' + split);
  if (split === 'final') {
    const devDirectory = path.join(research, 'lexical-candidate-v1-development');
    await verify(devDirectory);
    const dev = JSON.parse(await readFile(path.join(devDirectory, 'manifest.json'), 'utf8'));
    if (digest(dev.seal) !== digest(seal)) throw new Error('Candidate changed after development evaluation');
    const { runtime } = JSON.parse(await readFile(path.join(devDirectory, 'summary.json'), 'utf8'));
    if (!runtime.base.completedRequests || !runtime.candidate.completedRequests) throw new Error('An entire development arm failed to reach the model');
  }
  return evaluate(split, seal, directory);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main(process.argv.slice(2)).then(r => console.log(JSON.stringify(r, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
