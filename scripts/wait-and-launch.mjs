// Waits for the Vite dev server, builds the electron main/preload, then launches Electron.
import { setTimeout as sleep } from 'timers/promises';
import { spawn } from 'child_process';

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok || r.status === 200) return; } catch {}
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${url}`);
}

await waitFor('http://localhost:5173');
await new Promise((res, rej) => {
  const p = spawn('npm', ['run', 'bundle'], { stdio: 'inherit', shell: true });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error('bundle failed'))));
});
spawn('npx', ['electron', '.'], { stdio: 'inherit', shell: true });
