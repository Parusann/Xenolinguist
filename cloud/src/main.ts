import { timingSafeEqual } from 'node:crypto';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = await loadConfig();
const runtime = createApp(config);
const server = runtime.app.listen(4318, '127.0.0.1', () => console.log('Xenolinguist Atlas is ready at ' + config.origin));
server.on('error', () => { console.error('Atlas listener could not start.'); process.exitCode = 1; void runtime.close(); });
runtime.app.post('/internal/shutdown', (req, res) => {
  const supplied = Buffer.from(req.headers.authorization ?? ''), expected = Buffer.from('Bearer ' + config.controlToken);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    res.status(403).json({ error: 'control-credential' }); return;
  }
  res.json({ stopping: true });
  runtime.drain();
  server.close(() => { void runtime.close().then(() => process.exit(0)); });
  setTimeout(() => server.closeAllConnections(), 5000).unref();
});
