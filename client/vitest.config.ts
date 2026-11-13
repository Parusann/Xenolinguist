import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      engine: path.resolve(__dirname, '../engine/src'),
      '@': path.resolve(__dirname, './src'),
      shared: path.resolve(__dirname, '../shared'),
    },
  },
  test: {
    maxWorkers: process.env.XENO_RESEARCH_ROOT ? 1 : undefined,
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
