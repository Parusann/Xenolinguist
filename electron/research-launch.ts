import path from 'node:path';
import { lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';

/** Explicit source-workbench launch, with persistent data confined to the selected research HDD. */
export function researchLaunch(root: string | undefined) {
  if (!root) throw new Error('Research workbench launches require the prepared HDD environment');
  const resolved = realpathSync(root), marker = JSON.parse(readFileSync(path.join(resolved, 'config/research-workspace.json'), 'utf8'));
  if (resolved !== root || marker.project !== 'xenolinguist-research' || path.resolve(marker.root) !== root ||
      path.parse(root).root.toLowerCase() === (process.env.SystemDrive + '\\').toLowerCase()) throw new Error('Research workspace differs');
  const source = realpathSync(marker.source);
  if (!source.startsWith(root + path.sep)) throw new Error('Research source escapes its HDD');
  const data = path.join(root, 'data', 'desktop');
  mkdirSync(data, { recursive: true });
  let cursor = data;
  while (true) { if (lstatSync(cursor).isSymbolicLink()) throw new Error('Research desktop data cannot use links'); const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent; }
  if (realpathSync(data) !== data) throw new Error('Research desktop data moved');
  return { source, data };
}
