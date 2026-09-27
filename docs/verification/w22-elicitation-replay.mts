import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectNumberQuery, selectGrammarQuery } from '../../engine/src/elicitation/select.js';
import { stableKey } from '../../engine/src/elicitation/contracts.js';

const record = JSON.parse(await readFile(new URL('./w22-elicitation-example.json', import.meta.url), 'utf8'));
assert.equal(record.implementationRevision, '72ee9916e60d5eaa235e675addf380ee367555c1');
assert.equal(record.records.length, 3);
assert.deepEqual(record.records.map((r: { id: string }) => r.id), ['four-way-number-split', 'cost-sensitive-number-split', 'grounded-plural-distinction']);
for (const item of record.records) {
  assert.ok(['number', 'grammar'].includes(item.family));
  const result = (item.family === 'number' ? selectNumberQuery : selectGrammarQuery)(item.input);
  assert.equal(stableKey(result), stableKey(item.result), item.id);
}
assert.equal(record.records[0].result.selected.query.value, 11);
assert.equal(record.records[1].result.selected.query.value, 6);
assert.deepEqual(record.records[2].result.selected.groups.map((g: { form: string }) => g.form), ['en-nesh', 'nesh-en']);
console.log(JSON.stringify({ passed: true, records: 3, modelCalls: 0, scope: 'Deterministic selection examples only' }));
