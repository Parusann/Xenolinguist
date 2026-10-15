import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/public', workers: 1, retries: 0, timeout: 30000,
  outputDir: 'test-results/public-browser',
  reporter: [['list'], ['json', { outputFile: 'test-results/public-browser-report.json' }]],
  use: { baseURL: 'http://127.0.0.1:4178/Xenolinguist/', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js preview client --outDir ../test-results/public-site --base /Xenolinguist/ --host 127.0.0.1 --port 4178 --strictPort', url: 'http://127.0.0.1:4178/Xenolinguist/', reuseExistingServer: false },
});
