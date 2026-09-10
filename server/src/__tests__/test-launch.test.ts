import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { testUserData } from '../../../electron/test-launch.js';

describe('desktop test launch isolation', () => {
  it('does not redirect ordinary desktop data from DATA_DIR', () => {
    expect(testUserData([], { DATA_DIR: 'somewhere' })).toBeNull();
  });
  it('requires paired launch credentials', () => {
    expect(() => testUserData([], { XENO_TEST_MODE: '1' })).toThrow('Incomplete');
  });
  it('requires a matching token in a dedicated temporary directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xeno-acceptance-unit-'));
    const token = 'a'.repeat(32);
    writeFileSync(path.join(dir, '.xeno-test-token'), token);
    expect(testUserData([`--xeno-test-user-data=${dir}`], { XENO_TEST_MODE: '1', XENO_TEST_TOKEN: token })).toBe(dir);
    expect(() => testUserData([`--xeno-test-user-data=${dir}`], { XENO_TEST_MODE: '1', XENO_TEST_TOKEN: 'b'.repeat(32) })).toThrow('mismatch');
    expect(() => testUserData([`--xeno-test-user-data=${tmpdir()}`], { XENO_TEST_MODE: '1', XENO_TEST_TOKEN: token })).toThrow('isolated');
  });
});
