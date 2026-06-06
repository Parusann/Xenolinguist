/** electron-builder configuration. */
module.exports = {
  appId: 'sh.xenolinguist.app',
  productName: 'Xenolinguist',
  directories: { output: 'release' },
  // Bundled main/preload/server live in electron/dist; the SPA ships as a resource.
  files: ['electron/dist/**/*', 'package.json'],
  extraResources: [{ from: 'client/dist', to: 'client/dist' }],
  asar: true,
  // The forked server bundle must be a real file on disk for utilityProcess.fork.
  asarUnpack: ['electron/dist/server.cjs'],
  win: { target: ['nsis'] },
  mac: { target: ['dmg'], category: 'public.app-category.education' },
  linux: { target: ['AppImage', 'deb'], category: 'Education' },
  publish: null, // GitHub Releases is configured in the next task
};
