import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execFileSync } from 'node:child_process'

// Source identity is separate from the version of the published installer.
let sourceRevision = 'unversioned'
try { sourceRevision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim(); if (execFileSync('git', ['status', '--porcelain', '--', 'client', 'shared', 'engine'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim()) sourceRevision += '+working' } catch { /* Source archives may omit Git metadata. */ }

export default defineConfig({
  define: { 'import.meta.env.VITE_SOURCE_REVISION': JSON.stringify(sourceRevision) },
  plugins: [react(), tailwindcss()],
  resolve: {
    // Force a single React instance — react-router-dom hooks otherwise
    // resolve a second copy via dep pre-bundling ("Invalid hook call").
    dedupe: ['react', 'react-dom'],
    alias: {
      engine: path.resolve(__dirname, '../engine/src'),
      '@': path.resolve(__dirname, './src'),
      'shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
})
