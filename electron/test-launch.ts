import path from 'node:path';
import os from 'node:os';
import { readFileSync, realpathSync } from 'node:fs';

/** Explicit acceptance launches only. Never inherit DATA_DIR for a normal desktop launch. */
export function testUserData(argv = process.argv, env = process.env): string | null {
  const flag = argv.find(arg => arg.startsWith('--xeno-test-user-data='));
  if (!flag && !env.XENO_TEST_MODE) return null;
  if (!flag || env.XENO_TEST_MODE !== '1' || !/^[a-f0-9]{32}$/.test(env.XENO_TEST_TOKEN ?? '')) {
    throw new Error('Incomplete acceptance-test launch credentials');
  }
  const dir = realpathSync(flag.slice('--xeno-test-user-data='.length));
  const temporaryRoot = realpathSync(os.tmpdir());
  const relative = path.relative(temporaryRoot, dir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
      || !path.basename(dir).startsWith('xeno-acceptance-')) {
    throw new Error('Acceptance user data must be an isolated system-temp directory');
  }
  if (readFileSync(path.join(dir, '.xeno-test-token'), 'utf8') !== env.XENO_TEST_TOKEN) {
    throw new Error('Acceptance directory ownership token mismatch');
  }
  return dir;
}
