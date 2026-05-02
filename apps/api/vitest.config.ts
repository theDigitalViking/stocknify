import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import { defineConfig } from 'vitest/config'

dotenv.config({
  path: fileURLToPath(new URL('./.env.test', import.meta.url)),
  override: true,
})

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
  },
})
