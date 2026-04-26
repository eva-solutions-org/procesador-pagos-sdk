import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.{mock,e2e}.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
    },
  },
  define: {
    __SDK_API_URL__: JSON.stringify('http://localhost:8787'),
    __SDK_BUILD_ENV__: JSON.stringify('local'),
  },
})
