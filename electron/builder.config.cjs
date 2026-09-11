/** electron-builder configuration. */
module.exports = {
  appId: 'sh.xenolinguist.app',
  productName: 'Xenolinguist',
  directories: { output: 'release' },
  beforePack: async context => {
    if (context.electronPlatformName !== 'win32' || context.arch !== 1) throw new Error('Native asset manifest currently supports Windows x64 only');
    await (await import('../scripts/provision-models.mjs')).verifyAssets();
    await (await import('../scripts/stage-runtime.mjs')).stageRuntime();
  },
  afterPack: async context => {
    await (await import('../scripts/stage-runtime.mjs')).verifyPackagedRuntime(require('node:path').join(context.appOutDir, 'resources/server-deps'));
  },
  // Bundled main/preload/server live in electron/dist; the SPA ships as a resource.
  files: ['electron/dist/**/*', 'package.json'],
  extraResources: [
    { from: 'client/dist', to: 'client/dist' },
    { from: 'vendor/espeak-ng/win', to: 'espeak-ng' },
    { from: 'vendor/whisper/win', to: 'whisper' },
    { from: 'vendor/ipa-model', to: 'ipa-model' },
    { from: 'electron/runtime', to: 'server-deps' },
    // electron-builder excludes a source root's node_modules; copy that root explicitly.
    { from: 'electron/runtime/node_modules', to: 'server-deps/node_modules' },
    { from: 'vendor/model-manifest.json', to: 'model-manifest.json' },
    { from: 'vendor/THIRD_PARTY.md', to: 'THIRD_PARTY.md' },
  ],
  asar: true,
  // The forked server bundle must be a real file on disk for utilityProcess.fork.
  asarUnpack: ['electron/dist/server.cjs'],
  win: { target: ['nsis'], artifactName: 'Xenolinguist-Setup-${version}.${ext}' },
  mac: { target: ['dmg'], category: 'public.app-category.education' },
  linux: { target: ['AppImage', 'deb'], category: 'Education' },
  publish: { provider: 'github', owner: 'Parusann', repo: 'Xenolinguist' },
};
