/** electron-builder configuration. */
module.exports = {
  appId: 'sh.xenolinguist.app',
  productName: 'Xenolinguist',
  directories: { output: 'release' },
  // Bundled main/preload/server live in electron/dist; the SPA ships as a resource.
  files: ['electron/dist/**/*', 'package.json'],
  extraResources: [
    { from: 'client/dist', to: 'client/dist' },
    { from: 'vendor/espeak-ng/win', to: 'espeak-ng' },
    { from: 'vendor/whisper/win', to: 'whisper' },
    { from: 'vendor/ipa-model', to: 'ipa-model' },
    // Runtime deps for the IPA phoneme service (external in the server bundle). Shipped as
    // plain files (not in the asar) so the forked server can require them + load native .node;
    // main.ts points NODE_PATH at server-deps/node_modules.
    { from: 'node_modules/@huggingface/transformers', to: 'server-deps/node_modules/@huggingface/transformers' },
    { from: 'node_modules/@huggingface/jinja', to: 'server-deps/node_modules/@huggingface/jinja' },
    { from: 'node_modules/@huggingface/tokenizers', to: 'server-deps/node_modules/@huggingface/tokenizers' },
    { from: 'node_modules/onnxruntime-node', to: 'server-deps/node_modules/onnxruntime-node' },
    { from: 'node_modules/onnxruntime-common', to: 'server-deps/node_modules/onnxruntime-common' },
    { from: 'node_modules/onnxruntime-web', to: 'server-deps/node_modules/onnxruntime-web' },
  ],
  asar: true,
  // The forked server bundle must be a real file on disk for utilityProcess.fork.
  asarUnpack: ['electron/dist/server.cjs'],
  win: { target: ['nsis'] },
  mac: { target: ['dmg'], category: 'public.app-category.education' },
  linux: { target: ['AppImage', 'deb'], category: 'Education' },
  publish: { provider: 'github', owner: 'Parusann', repo: 'Xenolinguist' },
};
