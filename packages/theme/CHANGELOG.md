# @govcore/theme

## 0.1.1

### Patch Changes

- fbd5dc1: Ship compiled builds — retire source-first packaging (#71, closes #56).

  Every package published `main: ./src/index.ts`, which pushed core's build internals onto consumers: internal type deps leaked (a consumer needed `@types/bcryptjs` just to typecheck `@govcore/auth`, #56), every Next.js app had to list all 14 packages in `transpilePackages`, and non-Next/Node consumers couldn't consume the TS source at all.

  Each package now builds with **tsup** to ESM + `.d.ts` + sourcemaps in `dist/`, with `exports`/`main`/`types` pointing at the compiled output and `files` limited to what ships (`dist`, plus `migrations/` for schema and `base.css` for theme). Intra-package modules are bundled; `dependencies`/`peerDependencies` (the other `@govcore/*` packages, drizzle, react, …) stay external. Multi-entry packages keep their subpaths compiled — `@govcore/auth/password`, `@govcore/content/screens`, `@govcore/schema/migrate`; the `govcore-migrate` bin still resolves `../migrations` from `dist/`.

  Non-breaking: a consumer that keeps `transpilePackages` for these keeps working (transpiling already-compiled ESM is a no-op) — but no longer needs it, or any of core's internal `@types`. Proven by the canary (`examples/minimal-app`) now building with an empty `next.config`, and by a CI build step so both the canary and the smoke resolve the compiled `dist/` rather than source.

## 0.1.0

### Minor Changes

- 8db62da: Phase 4 (part 1) — the action seam and the accessibility floor.

  `@govcore/server`: `createTenantActions` → a typed `tenantAction` wrapper. It
  resolves the actor's active context (never trusting caller input), applies an
  optional permission gate, opens a transaction and sets the transaction-local
  `app.current_org` GUC so the schema's RLS policies bind to every query, and hands
  the handler an `audit` fn pre-bound to the actor + org.

  `@govcore/theme`: a WCAG-AA base token set (`base.css`, light/dark, visible focus
  ring), a Tailwind `baseTheme` preset, and `defineTheme` — which only allows
  overriding allowlisted brand vars and sanitizes values to prevent inline-`<style>`
  breakout (#769).
