import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { importEvidence, parseCsv, writeCsv } from './ingest.js';
import { sha256 } from './wold.js';

it('reads quoted CSV, BOM, newlines and escaped quotes without changing values', () => {
  const rows = parseCsv('\uFEFFid,form,meaning\r\n1,"a,b","a""b"\r\n2,"multi\nline",\r\n');
  expect(rows).toEqual([{ id: '1', form: 'a,b', meaning: 'a"b' }, { id: '2', form: 'multi\nline', meaning: '' }]);
  expect(parseCsv(writeCsv(rows, ['id', 'form', 'meaning']))).toEqual(rows);
  for (const bad of ['id,id\na,b', 'id,form\na', 'id\n"a', 'id\n"a"z', 'id\na"b', '__proto__\nx']) expect(() => parseCsv(bad)).toThrow();
  expect(() => parseCsv('id\na\nb', 100, 1)).toThrow('row limit');
  expect(() => parseCsv('id\na', 2)).toThrow('size');
});

it('imports evidence conservatively and preserves the pre-normalization form', () => {
  expect(importEvidence('csv', 'id,form,meaning,annotations\na,e\u0301,sun,')[0]).toEqual({ id: 'a', form: 'é', originalForm: 'e\u0301', meaning: 'sun' });
  expect(importEvidence('text', '  水\n\n猫 ')).toEqual([{ id: 'r0', form: '  水', originalForm: '  水' }, { id: 'r1', form: '猫 ', originalForm: '猫 ' }]);
  expect(() => importEvidence('json', '[{"id":"a","form":"b","trainingPermission":true}]')).toThrow();
  expect(() => importEvidence('json', '[{"id":"a","form":"b"},{"id":"a","form":"c"}]')).toThrow('Duplicate');
  expect(() => importEvidence('text', '')).toThrow();
});

it('retains every licensed pilot file, source identity, synonym and metadata join', async () => {
  const base = new URL('../../fixtures/reference/wold-pilot/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  for (const file of manifest.files) expect(sha256(await readFile(new URL(file.path, base)))).toBe(file.sha256);
  expect(manifest.role).toBe('reference-only');
  expect(manifest.includedInTraining).toBe(false);
  const read = async (name: string) => parseCsv(await readFile(new URL(name + '.csv', base), 'utf8'));
  const forms = await read('forms'), languages = await read('languages'), concepts = await read('parameters'), contributions = await read('contributions');
  expect(languages).toHaveLength(6); expect(concepts).toHaveLength(11);
  expect(forms.length).toBe(manifest.counts.forms);
  expect(forms.length).toBeGreaterThan(66); // Preserve multiple forms per language/concept.
  for (const form of forms) {
    expect(languages.some(l => l.ID === form.Language_ID)).toBe(true);
    expect(concepts.some(c => c.ID === form.Parameter_ID)).toBe(true);
    expect(contributions.some(c => c.Language_ID === form.Language_ID && c.Citation)).toBe(true);
    expect(form.Form).not.toBe(''); expect(form.Source).not.toBe('');
    expect(Object.hasOwn(form, 'Borrowed')).toBe(true);
  }
});
