# GovCore Architecture

**A reusable, opinionated multi-tenant foundation for Next.js apps.**

GovCore is the hardened *platform plane* — identity, organizations, memberships and active-org resolution, RBAC, audit, federation, support-access (break-glass / act-as), tenant backup, an accessible base theme, and a content engine — packaged as versioned `@govcore/*` packages. A same-stack app depends on it like it depends on `next` or `drizzle-orm`, and stands up a secure multi-tenant foundation in well under a day instead of re-implementing tenancy, auth, and audit from scratch.

- **Status:** shipped. 15 `@govcore/*` packages published to npm at `0.x`; the content engine is built and proven end to end. See [Status & decisions](#status--decisions).
- **Audience:** this doc is layered. [Part I](#part-i--the-idea) is the concept (what problem it solves, the trust boundary, what an app gets for free) and needs no code. [Part II](#part-ii--how-it-works) is how the enforcement works. [Part III](#part-iii--building-on-it) is how you actually build an app on it.
- **Building an app right now?** Jump to the [Consumer Guide](./consumer-guide.md) — day-one-to-first-login plus the invariants that fail in ways whose symptoms don't point at the cause.
- **License:** MIT.

---

## Part I — The idea

### The problem

Every serious multi-tenant SaaS re-implements the same *platform plane* — "who can do what, in which org, and how do we prove it" — and most re-implement it badly. Tenant isolation enforced by remembering to add `WHERE organization_id = ?` on every query. Audit logs that a bug (or an admin) can quietly rewrite. Logout that a rolled session cookie silently un-does. An SSO path that provisions an account it shouldn't. Each of these is a class of bug a framework should make *structurally impossible*, and each is usually rediscovered per app, in production.

GovCore is that platform plane, extracted once from a production app ([GovEA](https://github.com/roballred/GovEA)), hardened, and published so the next app inherits the hardened version instead of re-deriving it.

### What GovCore is — and isn't

**GovCore owns *tenants, identity, and trust*. It knows nothing about any app's domain.**

An app brings its own entities — capabilities, permits, inspections, whatever it models — and gets tenancy, auth, audit, and accessibility for free. The dividing line is one sentence:

> **The litmus test.** If a record carries `organization_id` because it is *app content*, it stays in the app. If a table exists so the platform can answer *"is this actor allowed to act in this org, and did we record it,"* it belongs to GovCore.

So GovEA owns *what a Capability is*; GovCore owns *the machinery that isolates it by tenant, checks who may edit it, and records that they did.*

### What an app gets for free

| The app **writes** | The app **inherits from GovCore** |
|---|---|
| Domain tables (permits, inspections…) + their migrations | orgs, users, memberships, audit, federation, support tables **+ their migrations** |
| Domain server actions & UI | Identity (local + OIDC SSO), org switching, session lifecycle |
| Brand theme (palette, logo) | WCAG-AA accessibility floor + safe theme injection |
| The list of domain tables to back up | Whole-tenant backup/restore engine (org-scoped, transactional, audited) |
| Provider secrets + route path config | RBAC, active-org resolution, append-only audit, edge-safe middleware, break-glass / act-as |

Everything on the left is the app's domain; everything on the right is configuration, not reimplementation. That asymmetry *is* the value proposition: the app author spends their time on the domain, never on "how do I isolate tenants," "is my logout actually safe," or "did my tenant export just leak another org's data."

### The opinionated stack

GovCore assumes exactly one stack and ships batteries-included for it:

- **App:** Next.js App Router, React, TypeScript
- **Database:** PostgreSQL + Drizzle ORM, tenant isolation enforced by Row-Level Security
- **Auth:** Auth.js (local credentials + OIDC SSO)
- **UI:** Tailwind CSS + shadcn/ui on a WCAG-AA base theme

What "opinionated" buys the consumer: they don't choose an auth library, an ORM, a tenancy model, or an audit format — they get a hardened one. What it costs: an app on a different stack gets nothing reusable here. That is the deliberate trade for batteries-included reuse, not an oversight.

### At a glance

GovCore is the foundation layer; each app is a thin domain + UI layer composed on top. The app never re-implements the platform plane — it *configures* it.

```text
┌──────────────────────────────────────────────────────────────────┐
│  CONSUMER APP  (e.g. GovEA) — owns domain + UI                     │
│                                                                    │
│   UI / pages          Domain entities         Domain actions       │
│   (brand theme)       capabilities, goals…    (tenantAction)       │
│        │                    │                       │              │
│        └──────────►  Composition layer  ◄───────────┘              │
│              schema compose · createAuth() · createMiddleware()     │
└────────────────────────────┬─────────────────────────────────────┘
                             │  depends on / configures (never reimplements)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  GOVCORE   @govcore/*   — platform plane (reusable)                │
│                                                                    │
│   auth    middleware   tenancy   rbac   audit   federation         │
│   support   backup   server   nextkit   theme (WCAG-AA)   content  │
│                              │                                      │
│       @govcore/schema  (table defs + platform migrations)          │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
                  ┌─────────────────────────┐
                  │      PostgreSQL         │
                  │  platform tables +      │
                  │  app domain tables      │
                  └─────────────────────────┘
```

---

## Part II — How it works

### The trust boundary: one enforced path

The heart of GovCore is that **every authenticated mutation flows through the same gates, and GovCore owns all of them.** The app supplies only the domain logic in the middle. Nothing about tenancy or permission is left to the app author's memory.

```text
Browser
  │  request + session cookie
  ▼
@govcore/middleware ─────────────────────────────────────────────────
  • read-only token decode (never writes session cookies)
  • resurrection guard · maintenance · password-expiry routing
  │
  ├─ blocked / unauthenticated ──►  redirect to /login
  │
  └─ allowed ▼
Server action (app)  ── wrapped in @govcore/server tenantAction ──────
  │
  ├─►  @govcore/tenancy: resolveActiveMembership
  │        └─ DB ──►  { organizationId, role }   (NEVER from caller input)
  │
  ├─►  @govcore/rbac gate:  hasPermission(role, 'content:edit')
  │
  ├─►  open tenant transaction · set_config('app.current_org', orgId, true)
  │        └─ Postgres RLS now scopes every query to this org
  │
  ├─►  DB query/mutate   (cross-org rows are invisible, by the database)
  │
  └─►  @govcore/audit:  append-only INSERT
           └─ Postgres trigger blocks UPDATE/DELETE
  │
  ▼
Result ──►  Browser
```

Read that path as a series of promises GovCore keeps for the app:

- The active org and role come **from the database, from the caller's active membership** — never from anything the caller can send.
- The permission gate runs **before** the handler.
- Isolation is enforced by **the database**, not by a `WHERE` clause the app has to remember (see below).
- The audit record is **append-only at the storage layer** — even a compromised admin can't rewrite history.

### Database-enforced tenant isolation

The isolation guarantee is worth its own section, because it's the design's sharpest edge and its strongest property.

**The failure mode it removes.** In an app that isolates tenants "by convention," the org boundary lives in application logic: every query is *supposed* to carry `WHERE organization_id = ?`, and every load is *supposed* to be followed by a visibility check. It's correct only as long as everyone remembers the second step. Forget one filter on one junction table and a report leaks another org's rows. That's precisely the bug class a framework should make impossible.

**How GovCore makes it impossible.** Three mechanisms compose:

1. **Row-Level Security.** Every platform table — and every app table scoped with `orgScoped` — sits behind an RLS policy: `USING (organization_id = current_setting('app.current_org')::uuid)`. A query that *forgets* its org filter still returns only the active org's rows, because the database refuses to show the rest.
2. **A transaction-local org GUC.** `tenantAction` opens a transaction and sets the org as a transaction-scoped setting — `set_config('app.current_org', orgId, true)` — before running the handler. The `true` makes it transaction-local, which matters: the app connects through a small direct pool, so a session-level `SET` would bleed across pooled requests. This is *why* all tenant DB access routes through the action's transaction.
3. **Two Postgres roles.** RLS does not apply to a table's owner, and a table's owner can drop the audit trigger. So the database is provisioned with two roles: an **owner/DDL role** used only by the migration runner (`govcore-migrate`), and a **non-owner runtime role** used by the app at request time. `FORCE ROW LEVEL SECURITY` binds RLS to the runtime role, which can read/write its org's data but **cannot** read another org's rows, rewrite audit history, or disable either protection.

Net effect: a compromised *app* role can't cross the tenant boundary and can't cover its tracks. The elevated privilege exists only at migration time. The honest cost — and it's a real architectural commitment, not a free toggle — is the rule that **all tenant-scoped DB access happens inside a tenant transaction.**

### The seams that make it reusable

The value isn't the tables — it's the **enforced patterns**, each exported as a factory or typed helper so the app can't accidentally bypass it.

- **Active-organization resolution** (`@govcore/tenancy`) — the single server-side answer to "which org am I acting in right now." Its selection order (last-selected → primary → oldest active, ignoring revoked memberships) is exactly the rule every multi-tenant app re-derives badly. GovCore owns it once, and it feeds the JWT and session.
- **`tenantAction`** (`@govcore/server`) — the server-action wrapper that is the path of least resistance for every mutation. It resolves the active membership, applies the permission gate, opens the tenant transaction and sets the RLS GUC, and binds `ctx.audit(...)` — collapsing the `auth()` → redirect → role-check → org-filter → audit dance that would otherwise be copy-pasted into every action file.
- **Middleware factory** (`@govcore/middleware`) — a read-only token decode (never writes session cookies), carrying the resurrection guard, maintenance redirect, and password-expiry routing. The app supplies only its public/instance path config. Edge-safe by construction (see the dependency graph).
- **Auth.js config factory** (`@govcore/auth`) — wraps the provider list, the Drizzle adapter, the SSO provisioning guard ("an external identity must map to a pre-provisioned, active user with ≥1 active membership"), session lifecycle, and the callbacks that stamp `organizationId` + active `role`. Providers and secrets are injected by the app.
- **Append-only audit** (`@govcore/audit`) — `ctx.audit(event)` plus a standalone writer, with the immutability trigger shipped as a migration. Security-critical paths (logout, cookie-clearing) never depend on the audit write succeeding.
- **Federation + support** (`@govcore/federation`, `@govcore/support`) — cross-org connections with a visibility enum (`org` / `connections` / `instance`) and the rule that cross-org links never become a back door around source visibility; break-glass and act-as sessions with bounded TTLs and the guarantee that revoking a break-glass parent terminates dependent act-as behavior.
- **Accessible base theme** (`@govcore/theme`) — the WCAG-AA floor lives in core, so every consumer inherits an accessible starting point. Apps override *brand* vars only (validated against an allowlist before injection, so a tenant color can't break out of the `<style>` tag); they cannot dig below the contrast floor. *Core owns the accessibility floor; apps decorate above it and can't dig below it.*
- **Tenant backup/restore** (`@govcore/backup`) — a whole-org, org-scoped, transactional, audited export/restore engine. The app declares only *which of its tables participate* (`registerBackupTables([...])`); core walks them filtered by org. Distinct from per-entity CSV import/export, which is a domain feature and stays in the app.

### Schema ownership: two migration streams, one database

**Core owns the platform tables and their migrations end to end. The app owns its domain tables and their migrations. One database, two migration streams that never overlap.**

`@govcore/schema` ships three things: the **table definitions** (so the app writes type-safe queries and FKs *to* platform tables), the **versioned migrations** for those tables (including the append-only audit trigger as a raw-SQL step), and a **migrate runner** (`govcore-migrate`) that applies them and tracks them in a core-owned journal, separate from the app's own Drizzle journal.

```text
  @govcore/schema                       App: src/db/schema/index.ts
  ──────────────────────────            ──────────────────────────────────
  organizations  ───────────────────►  imported (core owns the DDL)
  users          ───────────────────►  imported
  memberships    ───────────────────►  imported
  audit_log      ───────────────────►  imported
  org_connections / cross_org_links ─►  imported

                                        + app's OWN domain tables:
                              ┌───────►  permits      ...orgScoped(organizations)
        organization_id FK ───┤
                              └───────►  inspections  ...orgScoped(organizations)

  MIGRATIONS (two streams, no overlap):
    govcore-migrate     ──►  platform tables + audit trigger + RLS   (core owns)
    drizzle-kit migrate ──►  permits, inspections, …                 (app owns)
                                                 │
                                                 ▼
                                        one PostgreSQL schema
```

Every tenant-scoped table — core's *and* the app's — carries `organization_id uuid not null references organizations(id)`, via a published helper:

```ts
export const orgScoped = (orgs) => ({
  organizationId: uuid('organization_id').notNull()
    .references(() => orgs.id, { onDelete: 'cascade' }),
})
```

Because the platform DDL is authored once, in core, and shipped as immutable versioned files, **two consumer apps on the same `@govcore/schema` version have byte-identical platform schemas — the drift class is gone by construction, not by a test.** Core tables live in a dedicated `govcore` Postgres schema, so an app is free to have its own `users`/`sessions` tables without colliding. Platform schema changes ship *as migrations*; anything non-additive is a major version bump the consumer applies with `govcore-migrate` (it writes no DDL itself).

### The packages, and why there are many

GovCore is a set of small packages, not one `@govcore/core` barrel, for one load-bearing reason: **some of this code must run in the edge middleware runtime and must not drag in a DB client.** Splitting keeps the edge bundle edge-safe and keeps DB-touching code out of middleware.

| Package | Responsibility |
|---|---|
| `@govcore/schema` | Platform table defs + enums + migrations + `govcore-migrate` runner + trigger SQL |
| `@govcore/rbac` | Generic role/permission machinery (`createRbac`) — no fixed roles of its own |
| `@govcore/theme` | WCAG-AA base tokens + Tailwind preset + safe brand-var injection |
| `@govcore/audit` | Append-only audit writer + view + immutability trigger contract |
| `@govcore/tenancy` | Memberships, active-org resolution, org guards |
| `@govcore/auth` | Auth.js config factory, SSO guard, password + session lifecycle |
| `@govcore/federation` | Org connections + cross-org links + visibility |
| `@govcore/support` | Break-glass + act-as + instance-admin separation |
| `@govcore/backup` | Whole-tenant export/restore engine + domain-table registry |
| `@govcore/middleware` | Edge-safe Next middleware factory (types-only deps) |
| `@govcore/server` | `tenantAction` — the tenant-transaction + RLS-GUC + permission + audit wrapper |
| `@govcore/setup` | First-run bootstrap: runtime-role provisioning + first org/admin, idempotent |
| `@govcore/testing` | Test factories (`createTestOrg`/`createTestUser`, `withActiveMembership`) |
| `@govcore/nextkit` | UI primitives + the reusable instance-console React + the product-plane `AppShell` |
| `@govcore/content` | Content engine: type-def → Drizzle compiler, lifecycle, taxonomy, recipes, generated actions/UI |

The dependency graph has no cycles, and three packages stay **DB-free** so they're importable in Next middleware:

```text
EDGE-SAFE / DB-FREE  (importable in middleware, no DB client):
   @govcore/schema   →  (no deps)        # table defs; the migrate runner is a separate entrypoint
   @govcore/rbac     →  (no deps)
   @govcore/theme    →  (no deps)

DB-TOUCHING:
   @govcore/audit        →  schema
   @govcore/tenancy      →  schema, rbac
   @govcore/auth         →  schema, tenancy, rbac, audit
   @govcore/federation   →  schema, tenancy, audit
   @govcore/support      →  schema, tenancy, audit
   @govcore/backup       →  schema, tenancy, audit
   @govcore/server       →  tenancy, rbac, audit       # the tenantAction seam

NEXT.JS GLUE:
   @govcore/middleware   →  auth, tenancy              (TYPES ONLY — stays edge-safe)
   @govcore/nextkit      →  server, theme, federation, support, …  (UI layer)
   @govcore/content      →  schema, tenancy, rbac, audit, server, nextkit
```

Edge-safety is a **release gate**: CI asserts the DB-free packages import cleanly in an edge runtime, because a regression there silently breaks every consumer's middleware.

---

## Part III — Building on it

### How a new app uses GovCore

GovCore and the consumer app are **separate repos**. GovCore publishes versioned packages; the app declares them as dependencies — exactly like `next` or `drizzle-orm`. No submodule, no copy-paste, no source coupling. Each app pins a version and upgrades on its own cadence.

```text
   ┌──────────────────────────┐   ┌──────────────────────────┐
   │  GovEA repo              │   │  CivicTrack repo         │
   │  (consumer zero)         │   │  (a future app)          │
   │                          │   │                          │
   │  @govcore/* : ^x.y.z     │   │  @govcore/* : ^x.y.z     │
   │  + EA domain             │   │  + permits / inspections │
   │    (capabilities, goals) │   │    domain                │
   └──────────────────────────┘   └──────────────────────────┘

Both consume the SAME @govcore/* versions but own entirely different domains,
and both get identical hardened tenancy / auth / audit / accessibility for free.
```

The whole integration is a handful of composition points. Taking a fresh app **CivicTrack** end to end:

```ts
// 1. package.json — depend on the published packages
//    "@govcore/schema": "^1.0.0", "@govcore/auth": "^1.0.0", …
//    (peers: next, drizzle-orm, next-auth)

// 2. src/db/schema/index.ts — import core tables, add domain tables that FK to them
import { organizations, orgScoped } from '@govcore/schema'
export const permits = pgTable('permits', { ...orgScoped(organizations), title: text('title') })

// 3. package.json — platform migrations (core-owned) run before domain migrations (app-owned)
//    "db:migrate": "govcore-migrate && drizzle-kit migrate"

// 4. src/lib/auth.ts — configure identity (inject providers + secrets)
export const { handlers, auth } = createAuth({ db, schema, providers: [/* OIDC */], ssoGuard })

// 5. middleware.ts — configure route protection
export default createMiddleware({ publicPaths: ['/login'], instanceOnlyPaths: ['/instance'] })

// 6. tailwind.config.ts — inherit the WCAG-AA floor, add brand on top
export default { presets: [baseTheme], theme: { extend: { /* CivicTrack brand */ } } }

// 7. src/lib/backup.ts — register domain tables into core's tenant backup engine
registerBackupTables([permits, inspections])

// 8. a domain action — tenancy + RBAC + RLS + audit enforced by the wrapper
export const createPermit = tenantAction({ permission: 'content:create' },
  async ({ ctx, db }, input) => { /* ctx.organizationId already resolved & trusted */ })
```

Steps 2–8 are **configuration and composition, not reimplementation.** A secure multi-tenant skeleton stands up in well under a day; from there the app author writes only its domain.

### Configuration is injected, never hard-coded

Core exposes **factories that take config**, not modules that read global env at import time. The provider list is the clearest example of why: the *architecture* is "any OIDC provider + local credentials," and the factory makes that real instead of aspirational — the app injects its own provider and secrets, and operator-specific values live in env, never in source.

### The invariants that bite

A handful of rules, if gotten wrong, fail in ways whose symptoms don't point at the cause. They're documented with their failure modes in the **[Consumer Guide](./consumer-guide.md)** — the short list:

1. Connect at runtime as the **non-superuser** role, or RLS silently doesn't apply.
2. Login needs the **privileged pool** (`authDb`) — the runtime role can't read a user before an org context exists.
3. Cross-org operator work goes through `operatorAction`, not a raw pool.
4. Use `govcore-migrate` for platform tables, never `drizzle-kit push`.
5. All tenant access runs inside a `tenantAction`.
6. Audit is not optional, and never holds a secret.
7. Keep the middleware `matcher` inline (Next requires it statically analyzable).
8. Compile content types in dependency order.

### The content engine

Adding an entity type by hand means writing the same skeleton every time — a table, a validation schema, CRUD actions, a form, list and detail views, a draft→published lifecycle, taxonomy hooks — with only the fields changing. `@govcore/content` flips that from *hand-code each type* to **describe each type as data, and let the engine generate the rest**:

```ts
defineContentType({
  name: 'capability',
  label: 'Capability',
  fields: [
    { name: 'name',        type: 'text',     required: true },
    { name: 'description', type: 'textarea' },
    { name: 'owner',       type: 'reference', to: 'person' },
    { name: 'domain',      type: 'taxonomy',  tree: 'architecture-domains' },
  ],
})
```

The idea is a headless-CMS one (Contentful/Sanity/Strapi, or WordPress custom post types) — but built-in, multi-tenant, and audited rather than a separate hosted service. What keeps it from collapsing into the *inner-platform effect* (a generic engine that becomes a worse Postgres/React than the ones beneath it) is three rules:

1. **Compile to real tables, never an EAV blob.** A definition compiles into a real Drizzle table + a real migration — real columns, types, indexes, FKs, and `organization_id` scope. The engine is a code/DDL generator over the stack we already trust, not a runtime interpreter over a soft schema. Consequence, and it's a feature: type definitions join the migration stream, so RLS and the audited/versioned schema story apply to engine tables exactly as to hand-written ones.
2. **Relationships and computed fields are first-class.** `reference` (to-one) and `link` (to-many via a generated junction) so a traceability chain is *declared*, not hand-joined; derived fields (completeness, roll-ups) backed by a pure function the engine recomputes and caches.
3. **A per-type escape hatch to real code.** The engine generates the 80% (storage, validation, CRUD `tenantAction`s, lifecycle, list/detail UI); the 20% that makes an app more than a spreadsheet — impact analysis, publish-gate hooks — plugs in as typed hooks (`beforePublish`, `afterChange`, custom actions) running real server code with the real `db`. *That seam is the difference between a tool and a cage.*

Recipes complete the picture: a bundle of content types + seed content + framework classifications, installable per organization with no migration and no deploy — so "support framework X" becomes *data you install*, not *code you ship*. The engine is proven end to end (its generated table for a rich entity is indistinguishable from a hand-written one); migrating a given app's entities onto it is app-side work.

### Versioning & upgrading

Packages are released independently with Changesets and semver. Because core owns the platform migrations, a change to a core table's shape ships *as a migration* and is a **major** bump; additive changes may be minor. Upgrading is a normal dependency bump — a minor/patch is `pnpm up`; a major means running `govcore-migrate` to apply the new core-authored migrations. The app writes no platform DDL and reconciles no schema by hand. Consumers upgrade when *they* choose; they never move in lockstep. The `examples/minimal-app` fixture is the canary — built and smoke-tested in CI on every release, so "does a real consumer still compile and pass auth/tenancy smoke tests" is answered before publish.

---

## Status & decisions

**Shipped.** All 15 `@govcore/*` packages are implemented and published to npm at `0.x`. The DB-backed `examples/smoke` suite exercises the full stack in CI — migrations, RBAC/tenancy/audit, the audit-immutability trigger, RLS cross-org denial under the non-owner role, the support lifecycle, federation, a backup round-trip, and the content engine — and `examples/minimal-app` dogfoods a real consumer. The content engine (`@govcore/content`) is built and proven end to end; migrating any particular app's entities onto it is app-side work.

**GovEA cutover (consumer zero).** GovEA has adopted most of the platform plane from npm — RBAC, schema + `govcore-migrate`, tenancy guards, auth password flows, shared theming, and the product-plane `AppShell`. Remaining, tracked in the GovEA repo: the two-role split for auth ([GovEA #896](https://github.com/roballred/GovEA/issues/896)), adopting `@govcore/content/screens` for entity views ([#899](https://github.com/roballred/GovEA/issues/899)), and a last-admin guard fix ([#907](https://github.com/roballred/GovEA/issues/907)).

**Locked decisions.** These frame everything above:

| Decision | Choice |
|---|---|
| **Distribution** | Separate repo; published, semver'd `@govcore/*` packages |
| **Scope** | Platform plane **+ content engine**; an app's entity *definitions* stay app-side as configuration |
| **Stack coupling** | Opinionated — Next.js App Router + Drizzle + PostgreSQL + Auth.js. Other stacks out of scope |
| **DB ownership** | Core owns the platform tables **and** their migrations; the app owns only its domain tables |
| **Tenant isolation** | Database-enforced — Postgres RLS + a transaction-local org GUC + a two-role (owner/runtime) DB |
| **RBAC** | Generic `createRbac` over an app-supplied role/permission map; no fixed roles in core |
| **Accessibility** | A WCAG-AA base theme as the floor; apps add brand themes on top, never below it |
| **Tenant portability** | Core owns whole-tenant backup/restore to file; the app registers which tables participate |

### Related docs

- **[Consumer Guide](./consumer-guide.md)** — the day-one adoption runbook and the invariants, with failure modes.
- **[Base view contract](./design/base-view-contract.md)** — the acceptance spec for `@govcore/content/screens` and any consumer list/detail/edit view.
- **[`packages/README.md`](../packages/README.md)** — per-package orientation.
