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
  // import.meta.dirname is intentionally guarded in config.ts; the bundle never
  // hits that fallback (DATA_DIR is always set), so silence the cosmetic warning.
  logOverride: { 'empty-import-meta': 'silent' },
};

// Server: self-contained except @huggingface/transformers, which ships native ONNX runtime
// (.node) files esbuild can't bundle. Mark it external — the IPA service `await import()`s it,
// so in dev (node_modules present) it loads; in the packaged app it's shipped under
// resources/server-deps + resolved via NODE_PATH (see electron/builder.config.cjs + main.ts).
// If absent, the service throws IpaUnavailableError → /api/ipa 503 (graceful).
await build({
  ...common,
  entryPoints: ['electron/server-entry.ts'],
  outfile: 'electron/dist/server.cjs',
  external: ['@huggingface/transformers', 'onnxruntime-node', 'onnxruntime-web'],
});

// Electron main/preload: only 'electron' is external (provided by the runtime).
if (existsSync('electron/main.ts')) {
  await build({
    ...common,
    entryPoints: ['electron/main.ts', 'electron/preload.ts'],
    outdir: 'electron/dist',
    outExtension: { '.js': '.cjs' },
    external: ['electron', 'electron-updater'],
  });
}

console.log('bundled electron/dist');
