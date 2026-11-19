import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCsv, writeCsv } from './ingest.js';

const fixture = new URL('../../fixtures/reference/wold-pilot/', import.meta.url);
export const sha256 = (input: string | Uint8Array) => createHash('sha256').update(input).digest('hex');
type SourceLock = {
  repository: string; revision: string; release: string; doi: string; license: string;
  languages: string[]; concepts: string[]; files: { path: string; sha256: string }[];
};
export async function sourceLock(): Promise<SourceLock> {
  return JSON.parse(await readFile(new URL('source-lock.json', fixture), 'utf8'));
}

/** Local verified input only. Selection retains complete rows, synonyms and borrowing annotations. */
export async function buildWoldSubset(sourceDirectory: string, outputDirectory: string) {
  const lock = await sourceLock(), files = new Map<string, string>();
  for (const file of lock.files) {
    const bytes = await readFile(path.join(sourceDirectory, file.path));
    if (sha256(bytes) !== file.sha256) throw new Error('Upstream source hash mismatch: ' + file.path);
    files.set(file.path, bytes.toString('utf8'));
  }
  const table = (name: string) => parseCsv(files.get('cldf/' + name + '.csv')!, 32 * 1024 * 1024, 100000);
  const languages = table('languages').filter(r => lock.languages.includes(r.ID));
  const parameters = table('parameters').filter(r => lock.concepts.includes(r.ID));
  const contributions = table('contributions').filter(r => lock.languages.includes(r.Language_ID));
  const forms = table('forms').filter(r => lock.languages.includes(r.Language_ID) && lock.concepts.includes(r.Parameter_ID));
  if (languages.length !== lock.languages.length || parameters.length !== lock.concepts.length || contributions.length !== lock.languages.length)
    throw new Error('Selection metadata is incomplete');
  for (const language of lock.languages) for (const concept of lock.concepts)
    if (!forms.some(r => r.Language_ID === language && r.Parameter_ID === concept)) throw new Error('Missing language/concept cell');
  if (new Set(forms.map(r => r.ID)).size !== forms.length) throw new Error('Duplicate source form IDs');
  await mkdir(outputDirectory, { recursive: false });
  const outputs: Record<string, string> = {};
  for (const [name, rows] of Object.entries({ languages, parameters, contributions, forms }))
    outputs[name + '.csv'] = writeCsv(rows, Object.keys(rows[0]));
  outputs.LICENSE = files.get('LICENSE')!;
  outputs['sources.bib'] = files.get('cldf/sources.bib')!;
  for (const [name, content] of Object.entries(outputs)) await writeFile(path.join(outputDirectory, name), content, { flag: 'wx' });
  const manifest = {
    format: 'wold-reference-pilot-1', upstream: lock,
    role: 'reference-only', includedInTraining: false, includedInSyntheticBenchmark: false,
    transformations: ['select six language IDs and eleven concept IDs', 'retain all source columns and synonyms', 'serialize CSV using LF; do not normalize or rewrite source forms'],
    counts: { languages: languages.length, concepts: parameters.length, forms: forms.length },
    files: Object.entries(outputs).map(([name, content]) => ({ path: name, sha256: sha256(content) })),
  };
  await writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [source, output, ...extra] = process.argv.slice(2);
  if (!source || !output || extra.length) throw new Error('Usage: wold.ts <verified-source-directory> <new-output-directory>');
  buildWoldSubset(source, output).then(r => console.log(JSON.stringify({ counts: r.counts, role: r.role }, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
