import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv, writeCsv } from '../../../../shared/language-evidence.js';

const root = process.argv[2], destination = process.argv[3];
if (!root || !destination) throw new Error('Provide verified upstream and new fixture directories');
const revision = '81298aa26d01fdc11b769bcc7fa87ad9e43d7ccd';
const pinned = [
  ['LICENSE', '2fb94156cd39cad415432aeb1ac5b38d5cb53e1e'],
  ['README.md', '9c5ecd9da5841cc5b3a37c4571e7b4c73e97fab3'],
  ['metadata.json', 'dd23a1cf7bb7c5de28d77eb036ce063200b2034e'],
  ['cldf/codes.csv', '61544cb2e45175ee5d742050561b03fd93e647f7'],
  ['cldf/languages.csv', 'ea8b616b81179fcd81d4ddead2d05603ed40c34d'],
  ['cldf/parameters.csv', 'b1ef8fcf928d419895dd5f2272996a13e1313f52'],
  ['cldf/values.csv', 'cac53fdbf78017f366325cb03ae722b6ba7530a2'],
  ['cldf/sources.bib', '4028e1d5ac004943dcb824085e957895481ab9e5'],
  ['cldf/chapters.csv', 'e710b1921ed18bceb33812e62ed38fe9dc29e1e9'],
  ['cldf/contributors.csv', 'f85f98349a4aa6a2f5828e87614fbf0c206e2dd6'],
];
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const source = new Map<string, string>(), upstream = [];
for (const [file, gitSha] of pinned) {
  const bytes = await readFile(path.join(root, file));
  assert.equal(createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'), gitSha);
  source.set(file, bytes.toString('utf8'));
  upstream.push({ path: file, gitSha1: gitSha, sha256: sha(bytes) });
}
const csv = (file: string) => parseCsv(source.get('cldf/' + file + '.csv')!, 8 * 1024 * 1024, 100000);
const target = parseCsv(await readFile(new URL('../../../fixtures/reference/wold-pilot/languages.csv', import.meta.url), 'utf8'));
const allLanguages = csv('languages'), selected: Record<string, string>[] = [], excluded = [];
for (const language of target) {
  const matches = allLanguages.filter(row => row.Glottocode === language.Glottocode);
  if (matches.length !== 1) { excluded.push({ language: language.ID, reason: 'ambiguous-glottocode', candidates: matches.map(row => row.ID) }); continue; }
  selected.push({ ...matches[0], Target_Source_ID: 'wold-pilot-4.2', Target_Language_ID: language.ID });
}
const featureKeys: Record<string, string> = { '81A': 'word_order', '85A': 'adposition_order', '26A': 'morphology' };
const parameters: Record<string, string>[] = csv('parameters').filter(row => row.ID in featureKeys).map(row => ({ ...row, Atlas_Key: featureKeys[row.ID] }));
const values = csv('values').filter(row => row.Parameter_ID in featureKeys && selected.some(language => language.ID === row.Language_ID));
const codes = csv('codes').filter(row => row.Parameter_ID in featureKeys);
const chapters = csv('chapters').filter(row => parameters.some(parameter => parameter.Chapter_ID === row.ID));
const contributors = csv('contributors').filter(row => chapters.some(chapter => chapter.Contributor_ID.split(/\s+/u).includes(row.ID)));
const missing = selected.flatMap(language => parameters.filter(parameter => !values.some(row => row.Language_ID === language.ID && row.Parameter_ID === parameter.ID))
  .map(parameter => ({ language: language.Target_Language_ID, feature: parameter.ID, reason: 'not-coded-in-source' })));
const citations = new Set([...values.flatMap(row => row.Source.split(';').map(item => item.replace(/\[.*$/u, '').trim()).filter(Boolean)),
  ...chapters.flatMap(row => row.Source.split(/\s+/u).filter(Boolean))]);
const bibliography = source.get('cldf/sources.bib')!.split(/(?=^@)/mu).filter(entry => citations.has(entry.match(/^@\w+\s*\{\s*([^,\s]+)/u)?.[1] ?? '')).join('');
for (const id of citations) assert(bibliography.includes('{' + id + ',') || bibliography.includes('{' + id + '\n'), 'Missing bibliography ' + id);
await mkdir(destination, { recursive: true });
const files: { path: string; sha256: string }[] = [];
const save = async (name: string, value: string) => { await writeFile(path.join(destination, name), value, { flag: 'wx' }); files.push({ path: name, sha256: sha(value) }); };
for (const [name, rows] of Object.entries({ languages: selected, parameters, values, codes, chapters, contributors }))
  await save(name + '.csv', writeCsv(rows, Object.keys(rows[0])));
await save('LICENSE', source.get('LICENSE')!);
await save('sources.bib', bibliography);
const metadata = JSON.parse(source.get('metadata.json')!);
await save('NOTICE.md', '# WALS structural pilot\n\n' + metadata.citation + '\n\nCLDF v2020.6, revision ' + revision +
  '. Dataset DOI https://doi.org/10.5281/zenodo.23010827. CC BY 4.0.\n\nChapters 26, 81 and 85 by Matthew S. Dryer. Original chapter citations and value references are retained in CSV.\n\n' +
  'Changes: selected three features and unique exact Glottocode matches to the six-language WOLD pilot. Added target IDs and Atlas feature keys. Retained all source columns. No name-based or ambiguous matches. The bibliography is a subset containing all cited chapter and value sources. Reference-only, excluded from model training.\n');
await save('manifest.json', JSON.stringify({ format: 'wals-structural-pilot-1', role: 'reference-only', includedInTraining: false,
  upstream: { repository: 'https://github.com/cldf-datasets/wals', revision, release: 'v2020.6', doi: 'https://doi.org/10.5281/zenodo.23010827',
    license: metadata.license, files: upstream }, counts: { languages: selected.length, values: values.length, features: parameters.length },
  matching: 'unique exact Glottocode only', excluded, missing, files }, null, 2) + '\n');
console.log(JSON.stringify({ languages: selected.length, values: values.length, excluded, missing }));
