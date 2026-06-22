---
"@govcore/server": minor
"@govcore/theme": minor
---

Phase 4 (part 1) — the action seam and the accessibility floor.

`@govcore/server`: `createTenantActions` → a typed `tenantAction` wrapper. It
resolves the actor's active context (never trusting caller input), applies an
optional permission gate, opens a transaction and sets the transaction-local
`app.current_org` GUC so the schema's RLS policies bind to every query, and hands
the handler an `audit` fn pre-bound to the actor + org.

`@govcore/theme`: a WCAG-AA base token set (`base.css`, light/dark, visible focus
ring), a Tailwind `baseTheme` preset, and `defineTheme` — which only allows
overriding allowlisted brand vars and sanitizes values to prevent inline-`<style>`
breakout (#769).
