# @govcore/schema

## 0.2.1

### Patch Changes

- fbd5dc1: Ship compiled builds — retire source-first packaging (#71, closes #56).

  Every package published `main: ./src/index.ts`, which pushed core's build internals onto consumers: internal type deps leaked (a consumer needed `@types/bcryptjs` just to typecheck `@govcore/auth`, #56), every Next.js app had to list all 14 packages in `transpilePackages`, and non-Next/Node consumers couldn't consume the TS source at all.

  Each package now builds with **tsup** to ESM + `.d.ts` + sourcemaps in `dist/`, with `exports`/`main`/`types` pointing at the compiled output and `files` limited to what ships (`dist`, plus `migrations/` for schema and `base.css` for theme). Intra-package modules are bundled; `dependencies`/`peerDependencies` (the other `@govcore/*` packages, drizzle, react, …) stay external. Multi-entry packages keep their subpaths compiled — `@govcore/auth/password`, `@govcore/content/screens`, `@govcore/schema/migrate`; the `govcore-migrate` bin still resolves `../migrations` from `dist/`.

  Non-breaking: a consumer that keeps `transpilePackages` for these keeps working (transpiling already-compiled ESM is a no-op) — but no longer needs it, or any of core's internal `@types`. Proven by the canary (`examples/minimal-app`) now building with an empty `next.config`, and by a CI build step so both the canary and the smoke resolve the compiled `dist/` rather than source.

## 0.2.0

### Minor Changes

- d255afc: Operator-plane console mutations (#63). The org/user administration flows behind an instance console were rebuilt by every consumer (GovEA `actions/instance.ts`, GovCRM `lib/platform.ts`), and the user path is exactly where they diverged. Promote the mutations to core, composing the membership invariants from #65 so the guard and write-sync are identical everywhere.

  `@govcore/tenancy` gains `createOrganization` (auto-slug via the new exported `slugify`; a duplicate slug returns a typed `slug-taken`), `renameOrganization` (name-only; audited before/after), and `updateUserAdministration` — the guard-heavy one: it enforces the last-active-admin invariant via `assertNotLastActiveAdmin` (inside the transaction) and an own-instance-admin lockout, updates the `users` row, and keeps the membership in lockstep via `upsertMembership`. All audited as `platform.org.*` / `platform.user.update` and generic over the app's admin role name; tenancy now depends on `@govcore/audit`.

  `@govcore/auth` gains `provisionUser` — create a user with an initial password + primary membership. It lives here (not tenancy) because it hashes: validates against the policy, hashes, inserts, writes the membership through tenancy's `upsertMembership`, and audits `platform.user.create` without ever putting the password in the payload; a duplicate email returns a typed `email-taken`.

  `@govcore/schema` gains `isUniqueViolation(err)` — a pure, edge-safe SQLSTATE-23505 predicate so operator flows turn a duplicate slug/email into a typed result instead of a 500.

  All framework-agnostic (no FormData/redirect/revalidate — the consumer keeps the thin `'use server'` wrapper and the `instance_admin` gate) and returning typed results rather than throwing.

## 0.1.0

### Minor Changes

- f2f3743: Add `@govcore/schema`: the platform schema (identity, tenancy, auth, audit) in a
  dedicated `govcore` Postgres schema, with the `orgScoped` tenancy-column helper
  and `CORE_SCHEMA_VERSION`. Roles are `text` (app-defined via `@govcore/rbac`),
  not a fixed enum.

  Also adds federation (`org_connections`, `cross_org_links`), support access
  (`break_glass_sessions`, `act_as_sessions`), and instance config
  (`instance_settings`, `platform_config`).

  Ships authored migrations (`0000_platform_init`, `0001_platform_security` —
  append-only audit trigger + Row-Level Security with `FORCE ROW LEVEL SECURITY`;
  `0002_platform_federation_support` — federation tables with a both-participant
  RLS check) and the `govcore-migrate` runner (separate, non-edge `./migrate`
  entrypoint; tracked in `govcore.__govcore_migrations`; runs as the owner/DDL role).
