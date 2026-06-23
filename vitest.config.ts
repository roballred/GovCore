import { defineConfig } from 'vitest/config'

// Unit suite: pure, DB-free seams only (these run locally and in CI).
// DB-backed integration suites (RLS, tenantAction, sso-guard) live elsewhere
// and run CI-only — no local Postgres on the maintainer machine.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
  },
})
