import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { dataset, hash, learnerView, splitManifest, type Dataset } from './generator/dataset.js';
import { semanticKey } from './generator/semantics.js';
import { ENGINE_VERSION, atoms, predictionSchema, type Adapter, type Input, type Output } from './contracts.js';
import { exactLookup } from './adapters/exact-lookup.js';
import { symbolic } from './adapters/symbolic.js';
import { llmOnly, failed } from './adapters/llm-only.js';
import { hybrid } from './adapters/hybrid.js';
import type { ScoredItem } from './metrics/accuracy.js';
import type { RunRecord } from './records.js';
import { writeReports } from './reports.js';
import { requireLocalModel, ollamaJson } from '../../server/src/services/ollama-runtime.js';

const unique = <T>(values: T[]) => new Set(values).size === values.length;
export const configSchema = z.strictObject({ version: z.literal(1), name: z.string().regex(/^[a-z0-9-]+$/),
  splits: z.array(z.enum(['development', 'evaluation', 'structural'])).min(1).refine(unique),
  limit: z.number().int().min(1).max(30).default(30), budgets: z.array(z.number().int().min(0).max(29)).min(1).refine(unique),
  methods: z.array(z.enum(['exact-lookup', 'symbolic', 'llm-only', 'hybrid'])).min(1).refine(unique),
  modelSeeds: z.array(z.number().int().min(0).max(0x7fffffff)).min(1).refine(unique),
  model: z.strictObject({ name: z.string().min(1), temperature: z.number().min(0).max(2), num_ctx: z.number().int().min(1024).max(32768),
    num_predict: z.number().int().min(128).max(8192), timeoutMs: z.number().int().min(1000).max(600000) }), figures: z.boolean(),
}).refine(c => c.limit === 30 || c.splits.every(s => s === 'development'), 'Subsets are allowed only for development smoke tests');
export type Config = z.infer<typeof configSchema>;
export function project(data: Dataset, budget: number): Input {
  const view = learnerView(data);
  return { ...view, observations: view.observations.slice(0, budget), lexicalProbes: atoms.map(a => data.spec.lexicon[a]).sort() };
}
export function score(data: Dataset, output: Output): ScoredItem[] {
  const observedCounts = new Set(data.observations.flatMap(o => o.truth.clauses.flatMap(c => [c.agent.count, c.patient.count])));
  const semantics: ScoredItem[] = data.targets.map(t => {
    const matches = output.predictions.filter(p => p.id === t.id), p = matches.length === 1 ? matches[0] : undefined;
    let correct = false;
    try { correct = p?.status === 'answered' && semanticKey(p.meaning) === semanticKey(t.truth); } catch { /* invalid prediction is incorrect */ }
    const status = p?.status === 'answered' && !predictionSchema.safeParse(p.meaning).success ? 'invalid' : p?.status ?? 'invalid';
    return { id: t.id, kind: 'semantic', withheldForm: t.truth.clauses.some(c => !observedCounts.has(c.agent.count) || !observedCounts.has(c.patient.count)),
      status, correct, prediction: p ?? null, truth: t.truth };
  });
  return [...semantics, ...atoms.map(a => {
    const token = data.spec.lexicon[a], matches = output.lexical.filter(p => p.token === token), p = matches.length === 1 ? matches[0] : undefined;
    const status = p?.status === 'answered' && !atoms.includes(p.value!) ? 'invalid' : p?.status ?? 'invalid';
    return { id: token, kind: 'lexical' as const, withheldForm: false, status, correct: p?.status === 'answered' && p.value === a, prediction: p ?? null, truth: a };
  })];
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fileHash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
async function sourceSnapshot(directory: string) {
  const paths = ['package.json', 'package-lock.json', 'tsconfig.base.json', 'server/src/config.ts', 'server/src/services/ollama-runtime.ts', 'server/src/services/runtime-error.ts', 'shared/schemas/capabilities.ts'];
  async function walk(relative: string) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const p = `${relative}/${entry.name}`; if (entry.isDirectory()) await walk(p); else if (!p.endsWith('.pyc')) paths.push(p);
    }
  }
  await walk('evaluation'); await walk('engine/src');
  const files = [];
  for (const relative of paths.sort()) {
    const bytes = await readFile(path.join(root, relative)), target = path.join(directory, 'source', relative);
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes);
    files.push({ path: relative, sha256: fileHash(bytes) });
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  return { commit: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), trackedDirty: Boolean(git('status', '--porcelain', '--untracked-files=no')),
    files, snapshotHash: hash(files) };
}
const adapters: Record<Config['methods'][number], Adapter> = { 'exact-lookup': exactLookup, symbolic, 'llm-only': llmOnly, hybrid };
export async function run(config: Config, directory: string) {
  // Deliberately refuse overwriting any previous experiment, including partial/failed runs.
  await mkdir(directory, { recursive: false });
  const manifest = splitManifest(), source = await sourceSnapshot(directory), startedAt = new Date().toISOString();
  const metadata = { version: 1, engineVersion: ENGINE_VERSION, config, configHash: hash(config), source, corpus: manifest,
    startedAt, environment: { node: process.version, platform: process.platform, arch: process.arch, osRelease: os.release(),
      cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
    modelPreflight: null as unknown,
    plan: { callsPerModelRun: 1, training: 'ordered observation prefix, reset independently for each method/budget/repetition',
      order: 'rotate methods by language index plus repetition; serial execution; cold loads retained' } };
  const manifestFile = path.join(directory, 'manifest.json'), rawFile = path.join(directory, 'runs.jsonl');
  const saveManifest = (state: Record<string, unknown>) => writeFile(manifestFile, JSON.stringify({ ...metadata, ...state }, null, 2) + '\n');
  await saveManifest({ status: 'running' }); await writeFile(rawFile, '');
  let count = 0;
  try {
    let expectedDigest: string | undefined;
    if (config.methods.some(m => m === 'llm-only' || m === 'hybrid')) {
      const model = await requireLocalModel(config.model.name, AbortSignal.timeout(15000));
      expectedDigest = model.digest;
      metadata.modelPreflight = { model, ollama: await ollamaJson('/api/version'), checkedAt: new Date().toISOString() };
      await saveManifest({ status: 'running' });
    }
    for (const splitName of config.splits) {
      const split = manifest.splits.find(s => s.name === splitName)!;
      for (const [index, spec] of split.records.slice(0, config.limit).entries()) {
        const data = dataset(spec.seed, spec.family);
        if (data.sha256 !== spec.sha256) throw new Error('Frozen dataset mismatch');
        for (const budget of config.budgets) for (let repetition = 0; repetition < config.modelSeeds.length; repetition++) {
          const offset = (index + repetition) % config.methods.length;
          const order = [...config.methods.slice(offset), ...config.methods.slice(0, offset)];
          for (const method of order) {
            const usesModel = method === 'llm-only' || method === 'hybrid';
            if (!usesModel && repetition > 0) continue;
            const input = project(data, budget), beforeHash = hash(input), start = performance.now();
            let output: Output;
            try { output = await adapters[method](structuredClone(input), { settings: config.model, modelSeed: config.modelSeeds[repetition], expectedDigest }); }
            catch (e) { output = failed(input, 'error', e instanceof Error ? e.message : String(e)); }
            const record: RunRecord = { id: `${splitName}/${spec.seed}/${budget}/${method}/${repetition}`, split: splitName, seed: spec.seed,
              datasetHash: data.sha256, method, observations: input.observations.length, observationIds: input.observations.map(o => o.id), repetition,
              modelSeed: usesModel ? config.modelSeeds[repetition] : null, inputHash: beforeHash, input, latencyMs: performance.now() - start, output, items: score(data, output) };
            await appendFile(rawFile, JSON.stringify(record) + '\n'); count++;
            process.stdout.write(`${count} ${record.id} ${record.latencyMs.toFixed(0)}ms ${record.items.filter(i => i.kind === 'semantic' && i.correct).length}/5\n`);
          }
        }
      }
    }
    await writeReports(directory);
    if (expectedDigest) {
      try { await writeFile(path.join(directory, 'model-residency.json'), JSON.stringify(await ollamaJson('/api/ps'), null, 2) + '\n'); }
      catch { /* Residency is diagnostic; predictions and pinned digest are already retained. */ }
    }
    if (config.figures) execFileSync(process.env.EVALUATION_PYTHON || 'python', [path.join(root, 'evaluation/plot.py'), directory], { stdio: 'inherit' });
    const artifacts = [];
    for (const name of (await readdir(directory)).filter(n => /\.(jsonl|json|md|svg|png)$/.test(n) && n !== 'manifest.json').sort())
      artifacts.push({ path: name, sha256: fileHash(await readFile(path.join(directory, name))) });
    await saveManifest({ status: 'complete', completedAt: new Date().toISOString(), records: count, artifacts });
    return directory;
  } catch (e) {
    await saveManifest({ status: 'interrupted', records: count, error: e instanceof Error ? e.message : String(e), rawHash: fileHash(await readFile(rawFile)) });
    throw e;
  }
}
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--report') { if (!args[1]) throw new Error('Supply the result directory'); await writeReports(path.resolve(args[1])); return; }
  const config = configSchema.parse(JSON.parse(await readFile(path.resolve(args[0] ?? 'evaluation/configs/baseline.json'), 'utf8')));
  const directory = path.resolve(args[1] ?? `test-results/evaluation-${config.name}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await mkdir(path.dirname(directory), { recursive: true });
  await run(config, directory);
  const { verifyRun } = await import('./verify.js');
  console.log(JSON.stringify(await verifyRun(directory), null, 2));
  console.log(`Results: ${directory}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(e => { console.error(e); process.exitCode = 1; });
