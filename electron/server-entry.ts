// Start only after receiving credentials over the controlled parent IPC channel.
import { startServer } from '../server/src/index.js';
import { validateSession } from '../server/src/middleware/local-session.js';
const parentPort = (process as unknown as { parentPort?: {
  postMessage: (message: unknown) => void; once: (name: string, cb: (event: { data: unknown }) => void) => void;
} }).parentPort;
const timer = setTimeout(() => { console.error('[server] Local session handshake timed out'); process.exit(1); }, 30_000);
async function boot(input: unknown) {
  clearTimeout(timer);
  try {
    const session = validateSession(input);
    if (parentPort && session.mode !== 'desktop') throw new Error('Desktop session required');
    const handle = await startServer(session);
    if (parentPort) parentPort.postMessage({ type: 'server-ready', port: handle.port });
    else console.log(`[server] ready on ${handle.port}`);
  } catch {
    // Configuration input may contain credentials. Never include it in diagnostics.
    if (parentPort) parentPort.postMessage({ type: 'server-error', message: 'Local server startup failed' });
    console.error('[server] Local server startup failed'); process.exit(1);
  }
}
if (parentPort) parentPort.once('message', event => { void boot(event.data); });
else if (process.send && process.env.NODE_ENV !== 'production') process.once('message', message => { void boot(message); });
else { clearTimeout(timer); throw new Error('Controlled server launch required'); }
