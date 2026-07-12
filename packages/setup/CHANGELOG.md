# @govcore/setup

## 0.1.2

### Patch Changes

- c9cec04: auth: stop shipping a global `next-auth` augmentation; the consumer owns its session/role types (#108).

  `@govcore/auth`'s entry side-effect-imported a `declare module 'next-auth'` that stamped `session.user.role: string` (and a `@auth/core/jwt` `role?: string`) onto **every** consumer's compilation. A consumer that types `role` as its own union (not bare `string`) got its session augmentation overridden — `session.user.role` resolved to `string` and every typed-role call site failed. Worse, `@govcore/setup` imported `@govcore/auth` for a single type, so an app that only wanted `provisionRuntimeRole` inherited the augmentation too.

  - **`@govcore/auth`** no longer imports `./types` from its entry. `createAuth`'s callbacks type the claims they stamp via a **local** cast, so the package compiles without globally augmenting anyone. The augmentation is now an **opt-in** subpath: a single-role app that wants a ready-made session shape does `import '@govcore/auth/next-auth'`; an app with its own role type declares its own `next-auth` augmentation and skips it. No runtime change.
  - **`@govcore/setup`** imports `PasswordPolicy`/`hashPassword`/`validatePassword` from the leaf `@govcore/auth/password` instead of the package entry, so it no longer drags the augmentation.
  - **`examples/minimal-app`** now declares its own `next-auth` augmentation typing `role` as its `'admin' | 'member' | 'viewer'` union — the canary proves a typed-role consumer compiles against `createAuth`.

  **Migration:** a consumer relying on the old implicit `session.user.role: string` either adds `import '@govcore/auth/next-auth'` once (side-effect) or declares its own `next-auth` module augmentation (recommended — lets you type `role` as your role union).

- Updated dependencies [c9cec04]
  - @govcore/auth@0.5.0

## 0.1.1

### Patch Changes

- Updated dependencies [f993e42]
  - @govcore/schema@0.4.0
  - @govcore/tenancy@0.3.1
  - @govcore/audit@0.1.4
  - @govcore/auth@0.4.1

## 0.1.0

### Minor Changes

- 49d5125: New package `@govcore/setup` — first-run bootstrap for an empty instance (#68). Every consumer reinvented this (GovCRM's `seed.ts`, GovEA's setup action); it's error-prone twice over, because the runtime-role grants underpin RLS and the first-admin insert predates any tenant context.

  - **`bootstrap(db, { organization, admin, adminRole?, policy? })`** — on an **empty** instance, creates the first organization and its instance-admin in one transaction (validates the password, hashes it, writes the membership via `@govcore/tenancy`'s `upsertMembership`, audits `platform.bootstrap` without the password). **Refuses** with `already-bootstrapped` if any org exists, so it's safe to leave in a deploy step. Owner-run — the first user insert predates a tenant GUC that the runtime role's FORCE-RLS would require.
  - **`provisionRuntimeRole({ connectionString, role, password, schemas? })`** — creates the non-owner runtime role (idempotent) and grants it DML + **default privileges** on the given schemas (so content-engine tables created later are reachable). Identifiers are validated (`assertSafeIdentifier`, exported and unit-tested) before interpolation into DDL. This is the RLS-bound role the app connects as — see `@govcore/auth`'s `authDb` for why login still needs a separate pool.
  - **`runSetup(...)` + the `govcore-setup` bin** — one idempotent command from an empty database to first login: migrate → provision the runtime role → bootstrap. The bin reads `DATABASE_URL` / `GOVCORE_APP_ROLE` / `GOVCORE_ORG_NAME` / `GOVCORE_ADMIN_EMAIL` / … from the environment.

  Proven in `examples/smoke`: bootstrap creates the first org + instance-admin and a second run is refused; and `provisionRuntimeRole` now provisions the smoke's own non-owner role, so the existing RLS-isolation assertions validate its grants directly.

### Patch Changes

- Updated dependencies [c9ae7c1]
  - @govcore/schema@0.3.0
  - @govcore/tenancy@0.3.0
  - @govcore/auth@0.4.0
  - @govcore/audit@0.1.3
