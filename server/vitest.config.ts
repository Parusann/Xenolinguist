import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Archive, audio and experiment suites share the runner's disk bandwidth.
    // Bound CI concurrency while retaining the normal per-test deadlines.
    maxWorkers: process.env.CI ? 2 : undefined,
    include: ['src/**/*.test.ts', '../shared/sandbox/*.test.ts', '../shared/metrics/*.test.ts', '../evaluation/src/**/*.test.ts', '../engine/src/__tests__/*.test.ts'],
  },
});
