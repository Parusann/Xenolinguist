import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonical } from '../../../engine/src/evidence/dependencies.js';
import { requireLocalModel, localOllamaUrl } from '../../../server/src/services/ollama-runtime.js';
import { corpus, config, sha } from './corpus.js';
import { measure, replay, schedule, type Record as RunRecord, type Model } from './experiment.js';
import { summarize } from './score.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
async function atomic(file: string, data: unknown) { const tmp = file + '.pending'; await writeFile(tmp, JSON.stringify(data, null, 2) + '\n'); await rename(tmp, file); }
const contained = (directory: string, relative: string) => {
  const file = path.resolve(directory, relative), rel = path.relative(path.resolve(directory), file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Unsafe artifact path'); return file;
};
interface Manifest { config: typeof config; split: 'development' | 'evaluation'; model: Model; corpusHash: string;
  source: { commit: string; files: { path: string; sha256: string }[]; snapshotHash: string };
  runtime: { node: string; platform: string; arch: string; cpu: string; memoryBytes: number; gpu: string | null; ollama: unknown; warmup: string; tokenCounts: null };
  startedAt: string; status: 'running' | 'complete'; records: { path: string; sha256: string }[]; summaryHash?: string; }
export async function verify(directory: string, allowPartial = false) {
  const m: Manifest = await json(path.join(directory, 'manifest.json'));
  if (canonical(m.config) !== canonical(config) || !['development', 'evaluation'].includes(m.split) || (!allowPartial && m.status !== 'complete')) throw Error('Incomplete or incompatible experiment');
  if (sha(canonical(m.source.files)) !== m.source.snapshotHash) throw Error('Source index mismatch');
  for (const f of m.source.files) if (sha(await readFile(contained(directory, 'source/' + f.path))) !== f.sha256) throw Error('Source hash mismatch');
  const cases = corpus(m.split);
  if (m.corpusHash !== sha(canonical(cases))) throw Error('Corpus mismatch');
  if (sha(canonical(await json(path.join(directory, 'corpus.json')))) !== m.corpusHash) throw Error('Retained corpus mismatch');
  const expected = new Map(schedule(cases).map(({ c, method }) => [c.id + ':' + method, { c, method }]));
  const records: RunRecord[] = [];
  for (const f of m.records) {
    const bytes = await readFile(contained(directory, f.path)); if (sha(bytes) !== f.sha256) throw Error('Record hash mismatch');
    const record: RunRecord = JSON.parse(bytes.toString()), planned = expected.get(record.id);
    if (!planned || planned.method !== record.method || planned.c.id !== record.caseId || planned.c.condition !== record.condition || canonical(record.model) !== canonical(m.model)) throw Error('Unexpected/duplicate record');
    expected.delete(record.id); await replay(planned.c, record); records.push(record);
  }
  if (m.status === 'complete') {
    if (expected.size) throw Error('Missing scheduled outcomes');
    const bytes = await readFile(path.join(directory, 'summary.json'));
    if (sha(bytes) !== m.summaryHash || canonical(JSON.parse(bytes.toString())) !== canonical(summarize(records))) throw Error('Summary mismatch');
  }
  return { passed: true, records: records.length, pending: expected.size, split: m.split, corpusHash: m.corpusHash, sourceSnapshotHash: m.source.snapshotHash,
    modelGenerationReplayed: false, externalFailuresRetained: records.filter(r => r.failed).length };
}
export async function run(directory: string, split: 'development' | 'evaluation', resume = false, maxNewTasks = Infinity) {
  if (!(maxNewTasks === Infinity || Number.isSafeInteger(maxNewTasks) && maxNewTasks > 0)) throw Error('Invalid task limit');
  const controller = new AbortController(); const stop = () => controller.abort(); process.once('SIGINT', stop);
  let locked = false;
  try {
    if (!resume) await mkdir(directory, { recursive: false });
    // A stale lock is recoverable only after the owning process no longer exists.
    const lock = path.join(directory, 'run.lock');
    if (resume) try { const pid = Number(await readFile(lock, 'utf8')); if (!Number.isSafeInteger(pid) || pid < 1) throw Error('Invalid experiment lock'); let live = true; try { process.kill(pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') live = false; else throw e; } if (live) throw Error('Experiment process is still active'); await rm(lock); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    await writeFile(lock, String(process.pid), { flag: 'wx' }); locked = true;
    const dirty = git('status', '--porcelain', '--untracked-files=no');
    if (dirty) throw Error('Freeze tracked source before model runs');
    const model = await requireLocalModel(config.model, controller.signal), cases = corpus(split);
    let manifest: Manifest;
    if (resume) {
      manifest = await json(path.join(directory, 'manifest.json'));
      if (manifest.status === 'complete') throw Error('Experiment is already complete');
      if (manifest.split !== split || manifest.source.commit !== git('rev-parse', 'HEAD') || canonical(manifest.model) !== canonical(model)) throw Error('Resume identity mismatch');
      await verify(directory, true);
    } else {
      const files = [];
      const paths = git('ls-files').split('\n').filter(p => /^(engine|shared|evaluation|server)\//.test(p) && /\.(ts|json)$/.test(p) || ['package.json', 'package-lock.json', 'tsconfig.base.json'].includes(p));
      for (const p of paths) { const bytes = await readFile(path.join(root, p)), dest = contained(directory, 'source/' + p); await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, bytes); files.push({ path: p, sha256: sha(bytes) }); }
      const response = await fetch(localOllamaUrl() + '/api/version', { signal: controller.signal }); if (!response.ok) throw Error('Runtime version unavailable');
      let gpu: string | null = null; try { gpu = execFileSync('nvidia-smi', ['--query-gpu=name,driver_version,memory.total', '--format=csv,noheader'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* GPU identity unavailable on this host; do not infer CPU-only execution. */ }
      manifest = { config, split, model, corpusHash: sha(canonical(cases)), source: { commit: git('rev-parse', 'HEAD'), files, snapshotHash: sha(canonical(files)) },
        runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model ?? 'unknown', memoryBytes: os.totalmem(), gpu, ollama: await response.json(),
          warmup: 'No unrecorded warmup. First scheduled request may load the model; subsequent calls use the shipping two-minute keep-alive. Case order rotates methods.', tokenCounts: null },
        startedAt: new Date().toISOString(), status: 'running', records: [] };
      await atomic(path.join(directory, 'manifest.json'), manifest); await atomic(path.join(directory, 'corpus.json'), cases);
    }
    const records: RunRecord[] = [];
    let newTasks = 0;
    for (const { c, method } of schedule(cases)) {
      const name = c.id + '-' + method + '.json', file = contained(directory, name);
      const listed = manifest.records.find(r => r.path === name);
      if (listed) { records.push(await json(file)); continue; }
      if (controller.signal.aborted || newTasks >= maxNewTasks) break;
      // Recover an atomic record written before a process died updating the manifest. Never regenerate it.
      let record: RunRecord;
      try { record = await json(file); if (record.id !== c.id + ':' + method || canonical(record.model) !== canonical(model)) throw Error('Orphan record identity mismatch'); await replay(c, record); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; record = await measure(c, method, model, controller.signal); await atomic(file, record); }
      records.push(record); manifest.records.push({ path: name, sha256: sha(await readFile(file)) }); await atomic(path.join(directory, 'manifest.json'), manifest);
      newTasks++;
      console.log(JSON.stringify({ completed: records.length, total: schedule(cases).length, id: record.id, failed: record.failed, compatible: record.score.validation?.status, heldOut: record.score.predictions.map(p => p.status), ms: record.elapsedMs }));
    }
    if (records.length === schedule(cases).length) { await atomic(path.join(directory, 'summary.json'), summarize(records)); manifest.summaryHash = sha(await readFile(path.join(directory, 'summary.json'))); manifest.status = 'complete'; await atomic(path.join(directory, 'manifest.json'), manifest); }
    return verify(directory, manifest.status === 'running');
  } finally { process.off('SIGINT', stop); if (locked) await rm(path.join(directory, 'run.lock')); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, directory, ...flags] = process.argv.slice(2);
  if (!directory || !['verify', 'development', 'evaluation'].includes(mode)) throw Error('Usage: evaluate:proposals <development|evaluation|verify> <new-output-directory> [--resume|--partial]');
  const limit = flags.find(f => f.startsWith('--max-tasks='));
  const task = mode === 'verify' ? verify(path.resolve(directory), flags.includes('--partial')) : run(path.resolve(directory), mode as 'development' | 'evaluation', flags.includes('--resume'), limit ? Number(limit.split('=')[1]) : Infinity);
  task.then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e); process.exitCode = 1; });
}
