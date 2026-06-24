import { defineConfig } from 'vitest/config'

// Unit suite: pure, DB-free seams only (these run locally and in CI).
// DB-backed integration suites (RLS, tenantAction, sso-guard) live elsewhere
// and run CI-only — no local Postgres on the maintainer machine.
export default defineConfig({
  // Generated screens (@govcore/content/screens) are .tsx — use the automatic
  // JSX runtime so server-render tests don't need React in scope.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    environment: 'node',
  },
})
