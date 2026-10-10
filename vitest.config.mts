import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'packages/shared/src') } },
  test: {
    include: ['packages/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
})
