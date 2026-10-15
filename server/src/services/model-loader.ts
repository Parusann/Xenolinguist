import { createRequire } from 'node:module';
import path from 'node:path';
import { runtimeDependencyRoot } from '../config.js';

/** Use the package's supported Node require export, anchored outside app.asar. */
export function loadTransformers() {
  const root = runtimeDependencyRoot();
  if (!root) return import('@huggingface/transformers');
  const anchor = createRequire(path.join(root, 'runtime-anchor.cjs'));
  const resolved = anchor.resolve('@huggingface/transformers');
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Object.assign(new Error('Runtime resolved outside the packaged dependency root'), { code: 'MODULE_NOT_FOUND' });
  return Promise.resolve(anchor('@huggingface/transformers') as typeof import('@huggingface/transformers'));
}
