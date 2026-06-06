import 'dotenv/config';
import type { AddressInfo } from 'net';
import { createApp } from './app.js';
import { port } from './config.js';

export interface ServerHandle {
  port: number;
  close: () => Promise<void>;
}

export function startServer(): Promise<ServerHandle> {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(port(), '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      console.log(`[server] Xenolinguist API on http://127.0.0.1:${addr.port}`);
      resolve({
        port: addr.port,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

// Auto-start only when this file is the direct entry (dev: `tsx watch src/index.ts`),
// never when imported by tests or bundled behind server-entry.
const entry = process.argv[1] ? process.argv[1].replace(/\\/g, '/').split('/').pop() : '';
if (entry === 'index.ts' || entry === 'index.js' || process.env.XENO_START === '1') {
  void startServer();
}
