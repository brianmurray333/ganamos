import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Vitest configuration for real database integration tests.
 * These tests hit a real local Supabase instance (localhost:54321).
 *
 * Key differences from main vitest.config.mts:
 * - Uses tests/setup-db.ts (no global mocks)
 * - Only includes tests/integration/*.test.ts files
 * - Sequential execution via singleFork (prevents transaction conflicts)
 * - Longer timeouts for database operations
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup-db.ts'],
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.next'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@/app': path.resolve(__dirname, './app'),
      '@/tests': path.resolve(__dirname, './tests'),
    },
  },
})
