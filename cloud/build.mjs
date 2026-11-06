import { build as bundle } from 'esbuild';
import { build as web } from 'vite';
import react from '@vitejs/plugin-react';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
await bundle({ absWorkingDir: root, entryPoints: { main: 'src/main.ts', app: 'src/app.ts', 'comparison-thread': 'src/worker/comparison-thread.ts' },
  outdir: 'dist', outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm', target: 'node24',
  external: ['pg-native', 'bun:sqlite'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" }, logLevel: 'info' });
await web({ configFile: false, root: path.join(root, 'web'), plugins: [react()],
  cacheDir: path.join(root, 'node_modules/.vite'), resolve: { dedupe: ['react', 'react-dom'] },
  build: { outDir: path.join(root, 'dist/web'), emptyOutDir: true, target: 'es2022' } });
for (const directory of ['spacegrotesk', 'jetbrainsmono']) {
  await mkdir(path.join(root, 'dist/web/fonts', directory), { recursive: true });
  await cp(path.join(root, '../client/public/fonts', directory, 'OFL.txt'), path.join(root, 'dist/web/fonts', directory, 'OFL.txt'));
}
