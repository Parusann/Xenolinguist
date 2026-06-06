// Bundles the server entry (+ shared) and, once they exist, the electron
// main/preload into self-contained CJS files under electron/dist.
import { build } from 'esbuild';
import { existsSync } from 'fs';
import path from 'path';

// Resolve TypeScript NodeNext ".js" import specifiers to their ".ts" sources.
const tsResolve = {
  name: 'ts-js-resolve',
  setup(b) {
    b.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.importer) return;
      const abs = path.resolve(path.dirname(args.importer), args.path.replace(/\.js$/, '.ts'));
      return existsSync(abs) ? { path: abs } : undefined;
    });
  },
};

const common = {
  bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  plugins: [tsResolve], logLevel: 'info',
};

// Server: fully self-contained (cors/express/ollama/uuid/dotenv are pure JS).
await build({ ...common, entryPoints: ['electron/server-entry.ts'], outfile: 'electron/dist/server.cjs' });

// Electron main/preload: only 'electron' is external (provided by the runtime).
if (existsSync('electron/main.ts')) {
  await build({
    ...common,
    entryPoints: ['electron/main.ts', 'electron/preload.ts'],
    outdir: 'electron/dist',
    outExtension: { '.js': '.cjs' },
    external: ['electron'],
  });
}

console.log('bundled electron/dist');
