import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { accuracy, pairedInterval } from './metrics/accuracy.js';
import { calibration } from './metrics/calibration.js';
import { performanceSummary } from './metrics/performance.js';
import type { RunRecord } from './records.js';

export function summarize(records: RunRecord[]) {
  const groups = new Map<string, RunRecord[]>();
  for (const r of records) {
    const key = `${r.split}/${r.method}/${r.observations}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const summaries = [...groups.values()].map(rows => ({ split: rows[0].split, method: rows[0].method, observations: rows[0].observations,
    languages: new Set(rows.map(r => r.seed)).size, runs: rows.length, modelCalls: rows.filter(r => r.output.diagnostics.modelUsed === true).length,
    semantic: accuracy(rows.flatMap(r => r.items.filter(i => i.kind === 'semantic'))),
    lexical: accuracy(rows.flatMap(r => r.items.filter(i => i.kind === 'lexical'))),
    withheldForms: accuracy(rows.flatMap(r => r.items.filter(i => i.kind === 'semantic' && i.withheldForm))),
    latency: performanceSummary(rows.map(r => r.latencyMs)) }));
  const paired = [];
  for (const split of [...new Set(records.map(r => r.split))]) for (const budget of [...new Set(records.map(r => r.observations))]) {
    const methods = [...new Set(records.filter(r => r.split === split && r.observations === budget).map(r => r.method))];
    for (let a = 0; a < methods.length; a++) for (let b = a + 1; b < methods.length; b++) {
      const subset = records.filter(r => r.split === split && r.observations === budget);
      const values = (method: string) => {
        const map = new Map<number, number[]>();
        for (const r of subset.filter(r => r.method === method)) map.set(r.seed, [...(map.get(r.seed) ?? []), accuracy(r.items.filter(i => i.kind === 'semantic')).accuracy!]);
        return new Map([...map].map(([seed, scores]) => [seed, scores.reduce((x, y) => x + y, 0) / scores.length]));
      };
      const left = values(methods[a]), right = values(methods[b]);
      const differences = [...left].filter(([seed]) => right.has(seed)).map(([seed, v]) => right.get(seed)! - v);
      paired.push({ split, observations: budget, contrast: `${methods[b]} minus ${methods[a]}`, interval: pairedInterval(differences) });
    }
  }
  return { summaries, paired, calibration: calibration([]), limits: [
    'Synthetic bounded grammar with supplied hypothesis class; not unrestricted language acquisition.',
    'Accuracy uses every item, including abstentions, invalid responses, transport errors and timeouts.',
    'Latency is wall time for an entire language batch (training plus all probes), not a per-item measurement.',
    'Bootstrap intervals condition on the frozen languages and configuration; they do not model corpus design uncertainty.',
    'Withheld forms contain at least one entity count absent from the full training corpus; all challenge compositions are withheld.',
  ] };
}
export async function writeReports(directory: string) {
  const text = await readFile(path.join(directory, 'runs.jsonl'), 'utf8');
  const records = text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as RunRecord);
  const report = summarize(records);
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  const percent = (n: number | null) => n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`;
  const table = ['| Split | Method | Observations | Languages / runs | Semantic | Coverage | Lexical | Withheld forms | Model calls | Median batch ms |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |', ...report.summaries.map(s =>
      `| ${s.split} | ${s.method} | ${s.observations} | ${s.languages} / ${s.runs} | ${percent(s.semantic.accuracy)} | ${percent(s.semantic.coverage)} | ${percent(s.lexical.accuracy)} | ${percent(s.withheldForms.accuracy)} | ${s.modelCalls} | ${s.latency.medianMs?.toFixed(1)} |`)];
  const pairs = report.paired.map(p => `- ${p.split}, ${p.observations} observations, ${p.contrast}: ${p.interval ? `${percent(p.interval.mean)} [${percent(p.interval.lower)}, ${percent(p.interval.upper)}], ${p.interval.languageCount} paired languages` : 'unavailable'}.`);
  await writeFile(path.join(directory, 'report.md'), `# Baseline evaluation\n\n${table.join('\n')}\n\n## Paired differences\n\n${pairs.join('\n')}\n\n## Interpretation limits\n\n${report.limits.map(l => `- ${l}`).join('\n')}\n- Calibration unavailable: no baseline declares probability semantics.\n- Read manifest.json for configuration, source identity, completion status and raw hashes.\n`);
  return report;
}
