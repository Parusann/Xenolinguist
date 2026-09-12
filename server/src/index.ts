import 'dotenv/config';
import type { AddressInfo } from 'net';
import { createApp } from './app.js';
import { port, dataDir } from './config.js';
import { createLocalSession, type LocalSession } from './middleware/local-session.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { acquireDataOwner } from './services/data-owner.js';

export interface ServerHandle {
  port: number;
  close: () => Promise<void>;
}

export async function startServer(session: LocalSession = createLocalSession()): Promise<ServerHandle> {
  const releaseOwner = await acquireDataOwner(dataDir());
  let app;
  try { app = createApp(session); } catch (error) { await releaseOwner(); throw error; }
  return new Promise((resolve, reject) => {
    const server = app.listen(port(), '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      console.log(`[server] Xenolinguist API on http://127.0.0.1:${addr.port}`);
      resolve({
        port: addr.port,
        close: () => new Promise<void>((res, rej) => server.close(() => { void releaseOwner().then(res, rej); })),
      });
    });
    // Without this, a bind failure (EADDRINUSE etc.) would leave the promise pending forever.
    server.on('error', error => { void releaseOwner().then(() => reject(error), reject); });
  });
}

// Auto-start only when this file is the direct entry (dev: `tsx watch src/index.ts`),
// never when imported by tests or bundled behind server-entry.
const entry = process.argv[1] ? process.argv[1].replace(/\\/g, '/').split('/').pop() : '';
if (entry === 'index.ts' || entry === 'index.js' || process.env.XENO_START === '1') {
  if (process.env.NODE_ENV === 'production') throw new Error('Production server requires a controlled desktop launch');
  const session = createLocalSession('development');
  void (async () => {
    const handle = await startServer(session);
    await mkdir(dataDir(), { recursive: true });
    const file = path.join(dataDir(), '.development-pairing');
    await writeFile(file, session.secret, { mode: 0o600 });
    console.log(`[server] Development pairing code saved to ${file}; enter it in the workbench. Port ${handle.port}`);
  })();
}
