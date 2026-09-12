import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export interface AtomicFileOptions {
  previous?: boolean;
  rename?: typeof fs.rename;
  afterFlush?: () => Promise<void>;
}
export async function atomicWrite(file: string, content: string | Uint8Array, options: AtomicFileOptions = {}): Promise<void> {
  const target = path.resolve(file);
  const temporary = `${target}.${randomUUID()}.tmp`;
  if (path.dirname(temporary) !== path.dirname(target)) throw new Error('Temporary file must be a sibling');
  let handle;
  try {
    handle = await fs.open(temporary, 'wx');
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close(); handle = undefined;
    await options.afterFlush?.();
    if (options.previous) {
      try { await atomicWrite(`${target}.prev`, await fs.readFile(target, 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    const rename = options.rename ?? fs.rename;
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, target); break; }
      catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '') || attempt === 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt));
      }
    }
    // Directory fsync is not supported on Windows; file contents were flushed before replacement.
    if (process.platform !== 'win32') {
      const directory = await fs.open(path.dirname(target), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    }
  } finally {
    await handle?.close();
    await fs.rm(temporary, { force: true });
  }
}
