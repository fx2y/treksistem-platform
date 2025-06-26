import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '.wrangler/',
        'coverage/',
        '**/.next/**',
        '**/*.config.*',
        '**/*.d.ts'
      ]
    },
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/web/src'),
      '@treksistem/api': path.resolve(__dirname, './apps/api/src'),
      '@treksistem/db': path.resolve(__dirname, './packages/db/src'),
      '@treksistem/utils': path.resolve(__dirname, './packages/utils/src'),
      '@treksistem/types': path.resolve(__dirname, './packages/types/src')
    }
  }
})