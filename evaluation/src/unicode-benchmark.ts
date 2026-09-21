import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fixture from '../fixtures/unicode-lexical.json';
import { LexiconIndex } from '../../engine/src/lexicon/index.js';
import { lookup } from './adapters/exact-lookup.js';
import type { DictionaryEntry } from '../../shared/types.js';

export function unicodeBenchmark() {
  const rows = fixture.cases.map(probe => {
    const dictionary: DictionaryEntry[] = probe.dictionary.map((entry, i) => ({ ...entry, id: `word-${i}`,
      part_of_speech: 'unknown', confidence: null, context: '', examples: [], notes: '', created_at: '2026-09-21T00:00:00.000Z' }));
    const frozen = lookup(probe.input, dictionary).flatMap(token => token.english === null ? [] : [token.english]);
    const repaired = new LexiconIndex(dictionary).analyze(probe.input).flatMap(token => token.candidates.map(candidate => candidate.meaning));
    const same = (values: string[]) => JSON.stringify([...values].sort()) === JSON.stringify([...probe.expected].sort());
    return { id: probe.id, expected: probe.expected, frozen, repaired, frozenPass: same(frozen), repairedPass: same(repaired) };
  });
  return { version: fixture.version, scope: fixture.scope, denominator: rows.length,
    frozenPass: rows.filter(row => row.frozenPass).length, repairedPass: rows.filter(row => row.repairedPass).length, rows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = ['evaluation/fixtures/unicode-lexical.json', 'evaluation/src/unicode-benchmark.ts', 'evaluation/src/adapters/exact-lookup.ts',
    'engine/src/lexicon/index.ts', 'engine/src/lexicon/senses.ts', 'engine/src/text/normalize.ts', 'engine/src/text/spans.ts', 'engine/src/text/tokenize.ts'];
  const result = { ...unicodeBenchmark(), node: process.version, sourceSha256: Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])) };
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/w16-unicode-results.json', JSON.stringify(result, null, 2) + '\n');
  console.log(`Frozen lexical lookup: ${result.frozenPass}/${result.denominator}; Unicode lookup: ${result.repairedPass}/${result.denominator}. ${result.scope}`);
  if (result.repairedPass !== result.denominator) process.exitCode = 1;
}
