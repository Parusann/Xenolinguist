import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '../shared/sandbox/*.test.ts', '../shared/metrics/*.test.ts', '../evaluation/src/**/*.test.ts', '../engine/src/__tests__/*.test.ts'],
  },
});
