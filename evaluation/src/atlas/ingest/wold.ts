import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv } from '../../../../shared/language-evidence.js';

export type ReferenceBundle = {
  id: string; version: string; sha256: string; url: string; license: string; attribution: string;
  manifest: Record<string, unknown>;
  languages: { id: string; name: string; metadata: Record<string, unknown> }[];
  entries: { id: string; languageId: string; conceptId: string; meaning: string; form: string; metadata: Record<string, string> }[];
};
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Load the licensed, byte-verified research fixture into a reusable reference bundle. */
export async function loadWoldReference(directory: string): Promise<ReferenceBundle> {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.format, 'wold-reference-pilot-1');
  assert.equal(manifest.upstream.revision, '1df62b9bdc7292b35982aea49b4d5bd1951f6f3e');
  assert.equal(manifest.upstream.license, 'CC-BY-4.0');
  assert.equal(manifest.role, 'reference-only');
  assert.equal(manifest.includedInTraining, false);
  const files = new Map<string, string>();
  for (const entry of manifest.files) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(entry.path)) throw new Error('Unsafe reference fixture path');
    const bytes = await readFile(path.join(directory, entry.path));
    if (hash(bytes) !== entry.sha256) throw new Error('Reference fixture checksum differs');
    files.set(entry.path, bytes.toString('utf8'));
  }
  const csv = (name: string) => {
    const value = files.get(name);
    if (value === undefined) throw new Error('Required reference file is missing');
    return parseCsv(value);
  };
  const languages = csv('languages.csv'), concepts = csv('parameters.csv'), forms = csv('forms.csv'), contributions = csv('contributions.csv');
  assert.deepEqual({ languages: languages.length, concepts: concepts.length, forms: forms.length }, { languages: 6, concepts: 11, forms: 70 });
  const parameters = new Map(concepts.map(row => [row.ID, row]));
  const names = new Set(languages.map(row => row.ID));
  const attribution = await readFile(path.join(directory, 'NOTICE.md'), 'utf8');
  if (!files.get('LICENSE') || !files.get('sources.bib')) throw new Error('Reference license or bibliography is missing');
  const data = {
    id: 'wold-pilot-4.2', version: manifest.upstream.release as string, url: manifest.upstream.doi as string,
    license: 'CC-BY-4.0', attribution,
    manifest: { ...manifest, noticeSha256: hash(attribution), licenseText: files.get('LICENSE'), bibliography: files.get('sources.bib'),
      meaningNormalization: 'lowercase Concepticon gloss, falling back to the source English name without its leading article' },
    languages: languages.map(row => ({ id: row.ID, name: row.Name,
      metadata: { ...row, contributions: contributions.filter(contribution => contribution.Language_ID === row.ID) } })).sort((a, b) => a.id.localeCompare(b.id, 'en')),
    entries: forms.map(row => {
      const concept = parameters.get(row.Parameter_ID);
      if (!concept || !names.has(row.Language_ID) || !row.Form) throw new Error('Invalid reference form linkage');
      return { id: row.ID, languageId: row.Language_ID, conceptId: row.Parameter_ID,
        meaning: (concept.Concepticon_Gloss || concept.Name.replace(/^the /, '')).toLowerCase(),
        form: row.Form, metadata: { ...row, concepticonId: concept.Concepticon_ID, concepticonGloss: concept.Concepticon_Gloss } };
    }).sort((a, b) => a.id.localeCompare(b.id, 'en')),
  };
  if (new Set(data.entries.map(row => row.id)).size !== data.entries.length) throw new Error('Duplicate reference form identifiers');
  if (data.languages.some(language => !language.metadata.contributions.length)) throw new Error('Reference vocabulary attribution is missing');
  return { ...data, sha256: hash(JSON.stringify(data)) };
}
