# Xenolinguist client

React 19 / Vite / TypeScript frontend shared by the local workbench and public presentation.

Use the repository [build/setup guide](../README.md), [feature reference](../docs/FEATURES.md) and [testing guide](../docs/testing.md). Run commands from the repository root:

```sh
npm run dev
npm run typecheck
npm run lint -w client
npm test -w client
npm run test:e2e
npm run test:public
```

The public test command builds separately into `test-results/public-site` with `VITE_PUBLIC_SITE=true` and the `/Xenolinguist/` base path. It leaves the desktop `client/dist` build intact. Public `/app` requests return to download information. The local workbench needs its authenticated backend; direct browser development uses the pairing code printed by that backend.

Published installer metadata lives in `src/lib/site.ts`; Git source identity is injected at build time. A `+working` suffix indicates local client/shared changes. Both differ from the package version. The interactive public dictionary and hero examples derive from the versioned shared Eridian seed and make no model requests.
