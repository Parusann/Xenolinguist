import { it, expect } from 'vitest';
import { unicodeBenchmark } from './unicode-benchmark.js';

it('replays every supplied-dictionary Unicode regression probe against both implementations', () => {
  const result = unicodeBenchmark();
  expect(result.repairedPass).toBe(result.denominator);
  expect(result.rows.filter(row => !row.repairedPass)).toEqual([]);
  expect(result.frozenPass).toBeLessThan(result.repairedPass);
});
