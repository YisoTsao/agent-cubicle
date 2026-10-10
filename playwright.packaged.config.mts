import { defineConfig } from '@playwright/test'

// Smoke tests against the packaged app (`pnpm dist:dir` first).
export default defineConfig({
  testDir: 'tests/packaged',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
})
