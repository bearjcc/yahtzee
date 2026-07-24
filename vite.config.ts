/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/yahtzee/',
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
  },
})
