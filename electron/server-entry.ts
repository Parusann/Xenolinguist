// Production server entry: started inside an Electron utilityProcess.
// Boots the Express server and reports the bound port to the main process.
import { startServer } from '../server/src/index.js';

const parentPort = (process as unknown as { parentPort?: { postMessage: (m: unknown) => void } }).parentPort;

startServer()
  .then((handle) => {
    if (parentPort) parentPort.postMessage({ type: 'server-ready', port: handle.port });
    else console.log(`[server] ready on ${handle.port}`);
  })
  .catch((err) => {
    if (parentPort) parentPort.postMessage({ type: 'server-error', message: String(err) });
    console.error('[server] failed to start', err);
    process.exit(1);
  });
