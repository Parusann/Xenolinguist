import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv } from '../../../../shared/language-evidence.js';
import type { ReferenceBundle } from './wold.js';

export type StructuralFeature = { languageId: string; key: string; value: string; targetSourceId: string; targetLanguageId: string; metadata: Record<string, unknown> };
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export async function loadWalsReference(directory: string): Promise<ReferenceBundle & { features: StructuralFeature[] }> {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.format, 'wals-structural-pilot-1');
  assert.equal(manifest.upstream.revision, '81298aa26d01fdc11b769bcc7fa87ad9e43d7ccd');
  assert.equal(manifest.upstream.license, 'CC-BY-4.0');
  assert.equal(manifest.role, 'reference-only'); assert.equal(manifest.includedInTraining, false);
  const files = new Map<string, string>();
  for (const entry of manifest.files) {
    assert(/^[a-zA-Z0-9_.-]+$/.test(entry.path), 'Unsafe reference fixture path');
    const bytes = await readFile(path.join(directory, entry.path));
    assert.equal(hash(bytes), entry.sha256, 'Structural reference checksum differs'); files.set(entry.path, bytes.toString('utf8'));
  }
  const csv = (file: string) => { const value = files.get(file + '.csv'); assert(value); return parseCsv(value); };
  const languages = csv('languages'), parameters = csv('parameters'), codes = csv('codes'), chapters = csv('chapters'), values = csv('values');
  assert.equal(languages.length, 5); assert.equal(values.length, 12); assert.equal(parameters.length, 3);
  const features = values.map(row => {
    const language = languages.find(language => language.ID === row.Language_ID), parameter = parameters.find(parameter => parameter.ID === row.Parameter_ID);
    const code = codes.find(code => code.ID === row.Code_ID), chapter = chapters.find(chapter => chapter.ID === parameter?.Chapter_ID);
    assert(language && parameter && code && chapter);
    return { languageId: language.ID, targetSourceId: language.Target_Source_ID, targetLanguageId: language.Target_Language_ID,
      key: parameter.Atlas_Key, value: code.Name, metadata: { sourceRow: row, code, parameter, chapter,
        citation: chapter.Citation, sourceUrl: 'https://wals.info/feature/' + parameter.ID,
        allowedValues: codes.filter(code => code.Parameter_ID === parameter.ID).map(code => code.Name) } };
  }).sort((a, b) => a.languageId.localeCompare(b.languageId, 'en') || a.key.localeCompare(b.key, 'en'));
  const attribution = files.get('NOTICE.md'); assert(attribution && files.get('LICENSE') && files.get('sources.bib'));
  const data = { id: 'wals-pilot-2020.6', version: manifest.upstream.release as string, url: manifest.upstream.doi as string,
    license: 'CC-BY-4.0', attribution, manifest: { ...manifest, licenseText: files.get('LICENSE'), bibliography: files.get('sources.bib') },
    languages: languages.map(row => ({ id: row.ID, name: row.Name, metadata: row })).sort((a, b) => a.id.localeCompare(b.id, 'en')),
    entries: [], features };
  return { ...data, sha256: hash(JSON.stringify(data)) };
}
