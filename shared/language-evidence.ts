import { z } from 'zod';

/** Bounded RFC-4180-style reader; quoted newlines, escaped quotes, CRLF and BOM are supported. */
export function parseCsv(input: string, maxBytes = 2 * 1024 * 1024, maxRows = 10000): Record<string, string>[] {
  if (Buffer.byteLength(input) > maxBytes || input.includes('\0')) throw new Error('CSV size or character limit');
  const source = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const finishField = () => { row.push(field); field = ''; closed = false; };
  const finishRow = () => {
    finishField(); rows.push(row); row = [];
    if (rows.length > maxRows + 1) throw new Error('CSV row limit');
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === ',') finishField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      finishRow();
    } else if (closed) throw new Error('Unexpected character after CSV quote');
    else if (char === '"') {
      if (field.length) throw new Error('Unexpected CSV quote');
      quoted = true;
    } else field += char;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (field.length || row.length || closed) finishRow();
  const headers = rows.shift();
  if (!headers?.length || headers.some(h => !h || ['__proto__', 'constructor', 'prototype'].includes(h)) || new Set(headers).size !== headers.length)
    throw new Error('Invalid or duplicate CSV headers');
  return rows.map(values => {
    if (values.length !== headers.length) throw new Error('CSV row width mismatch');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

export function writeCsv(records: Record<string, string>[], headers: string[]) {
  const quote = (s: string) => /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  return [headers, ...records.map(r => headers.map(h => r[h] ?? ''))].map(row => row.map(quote).join(',')).join('\n') + '\n';
}

const text = z.string().min(1).max(4096).refine(s => !s.includes('\0'));
const rowSchema = z.strictObject({ id: z.string().min(1).max(80), form: text, meaning: text.optional(), annotations: text.optional() });
export type ImportedRecord = z.infer<typeof rowSchema> & { originalForm: string };

/** Import only: this grants no publication, comparison or model-training permission. */
export function importEvidence(format: 'csv' | 'json' | 'text', input: string,
  limits = { maxBytes: 2 * 1024 * 1024, maxRows: 10000 }): ImportedRecord[] {
  if (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1 || limits.maxBytes > 5 * 1024 * 1024 ||
      !Number.isSafeInteger(limits.maxRows) || limits.maxRows < 1 || limits.maxRows > 10000)
    throw new Error('Unsupported import limits');
  if (Buffer.byteLength(input) > limits.maxBytes || input.includes('\0')) throw new Error('Input size or character limit');
  let raw: unknown;
  if (format === 'csv') {
    const rows = parseCsv(input, limits.maxBytes, limits.maxRows);
    raw = rows.map(r => Object.fromEntries(Object.entries(r).filter(([k, v]) => v !== '' || !['meaning', 'annotations'].includes(k))));
  } else if (format === 'json') raw = JSON.parse(input);
  else if (format === 'text') raw = input.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).filter(s => s.trim().length).map((form, i) => ({ id: 'r' + i, form }));
  else throw new Error('Unsupported evidence format');
  const rows = z.array(rowSchema).min(1).max(limits.maxRows).parse(raw);
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('Duplicate record IDs');
  return rows.map(r => ({ ...r, originalForm: r.form, form: r.form.normalize('NFC') }));
}
