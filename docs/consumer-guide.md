# Consumer Guide — adopting `@govcore/*`

This is the runbook for building a new app on GovCore: the day-one path from an
empty database to a working login, and the handful of invariants that, if you get
them wrong, fail in ways whose symptoms don't point at the cause.

Every invariant below now has a first-class API — you should not need to
re-derive any of them. The canonical, always-current example is
[`examples/minimal-app`](../examples/minimal-app) (built in CI on every PR); when
a snippet here and that app disagree, the app is right.

> **Audience:** a *new* consumer, adopting-focused. For the architecture behind
> these steps — the trust boundary, the seams, the package map — see
> [`docs/architecture.md`](./architecture.md).

---

## Mental model

GovCore owns **tenants, identity, and trust** — not your domain. You bring your
entities; you get multi-tenancy, auth, audit, and accessibility.

Two things are load-bearing and shape everything else:

1. **Row-Level Security (RLS).** `govcore.users`, memberships, and `audit_log`
   are protected by Postgres RLS keyed on a transaction-local GUC,
   `app.current_org`. A query only sees a tenant's rows when that tenant's id is
   set on the current transaction. With no GUC set, **you see nothing** (deny by
   default). The policies are `FORCE` — they bind even the table owner.

2. **Two database roles.** Because RLS is `FORCE`, your app must connect as a
   **non-owner, non-superuser** role so the policies actually bind it. A second,
   privileged connection (owner/superuser or a `BYPASSRLS` role) does the things
   that happen *before or across* a tenant context: migrations, first-run setup,
   login lookups, and cross-org operator work.

If you internalize those two, the rest of this guide is mechanical.

---

## Day one → first login

The whole sequence is one idempotent command. As the **owner/superuser**:

```bash
DATABASE_URL=postgresql://owner:…@host/db \
GOVCORE_APP_ROLE=myapp_runtime GOVCORE_APP_PASSWORD=… \
GOVCORE_ORG_NAME="Acme" \
GOVCORE_ADMIN_EMAIL=admin@acme.example GOVCORE_ADMIN_PASSWORD=… \
  npx govcore-setup
```

That runs, in order (see [`@govcore/setup`](../packages/setup)):

1. **`govcore-migrate`** — applies the platform migrations (tables, the
   append-only audit trigger, the RLS policies). Idempotent.
2. **`provisionRuntimeRole`** — creates the non-owner runtime role and grants it
   DML + *default* privileges on the schema (so tables created later, e.g. by the
   content engine, are reachable without re-granting).
3. **`bootstrap`** — on an **empty** instance, creates the first organization and
   its instance-admin, in one audited transaction. **Refuses** if any org already
   exists, so it's safe to leave wired into a deploy step.

Prefer to call the pieces yourself? Import `runSetup`, `bootstrap`, and
`provisionRuntimeRole` from `@govcore/setup` — the bin is a thin wrapper.

Then, in the app, wire the two connections and the seams. Copy these from
`minimal-app`; they are short and stable:

| Concern | File in `minimal-app` | What it does |
|---|---|---|
| DB client | [`src/db/client.ts`](../examples/minimal-app/src/db/client.ts) | the app's Drizzle client |
| Auth | [`src/lib/auth.ts`](../examples/minimal-app/src/lib/auth.ts) | `createAuth({ db })` — add `authDb` for the two-role split (§2) |
| RBAC | [`src/lib/rbac.ts`](../examples/minimal-app/src/lib/rbac.ts) | your role/permission map via `createRbac` |
| tenantAction | [`src/content/note-actions.ts`](../examples/minimal-app/src/content/note-actions.ts) | the enforced server-action seam, from `createTenantActions` |
| Middleware | [`src/middleware.ts`](../examples/minimal-app/src/middleware.ts) | route protection (note the matcher rule below) |
| A content type | [`src/content/note.ts`](../examples/minimal-app/src/content/note.ts) + [`note-actions.ts`](../examples/minimal-app/src/content/note-actions.ts) | define-as-data → generated CRUD |
| A screen | [`src/app/notes/page.tsx`](../examples/minimal-app/src/app/notes/page.tsx) | generated, paginated list + form |

Sign in with the bootstrap admin. You're up.

> **`minimal-app` is deliberately single-role** — one connection, run as the
> owner, to keep the demo small. It shows the *seams* (auth, rbac, tenantAction,
> content, pagination), not the production database topology. For a real
> deployment, split into the two roles described next: connect the app as the
> non-owner runtime role and pass a privileged pool as `authDb` — invariants §1
> and §2.

---

## The invariants (and how they fail)

### 1. Connect as a non-superuser, or RLS silently doesn't apply

**Failure mode:** everything *looks* like it works — until you notice one org can
read another's rows. A superuser (and, under non-`FORCE` RLS, the table owner)
**bypasses RLS entirely**, so a dev who points the app at `postgres:postgres`
gets a system with no tenant isolation and no error.

**Do:** run the app as the role `provisionRuntimeRole` created. Verify isolation
early — with two orgs seeded, confirm a query under org A's context returns only
A's rows and a query with *no* context returns **zero**.

### 2. Login needs the privileged pool — `authDb`

**Failure mode:** you wire `createAuth({ db })` with your runtime pool and every
login fails with `CredentialsSignin`. A credentials login looks the user up **by
email before any session exists**, so there's no `app.current_org` GUC yet and
RLS filters the lookup to zero rows.

**Do:** pass both pools — `createAuth({ db, authDb })`. `authDb` is the privileged
pool; createAuth uses it for the adapter, the credentials lookup, the SSO check,
membership resolution, and login audit — all pre/cross-tenant. It defaults to
`db`, which is correct only for single-role/dev setups. (Reminder: `FORCE` RLS
binds even the owner, so `authDb` must be a **superuser or `BYPASSRLS`** role.)

### 3. Cross-org operator work goes through `operatorAction`, not a raw pool

**Failure mode:** the instance console needs to list every org / provision a user
in any org, so you reach for a raw privileged-pool query — ungated, un-audited,
easy to leave exposed.

**Do:** build an `operatorAction` with `createOperatorActions({ operatorDb, … })`.
It's the mirror of `tenantAction`: privileged pool, **no** org GUC (cross-org by
design), gated by `instanceRole` (default `instance_admin`), with an audit writer
bound to the operator. Compose the operator mutations from `@govcore/tenancy`
(`createOrganization`, `updateUserAdministration`, `suspendOrganization`, …) and
`@govcore/auth` (`provisionUser`) inside it.

### 4. `govcore-migrate`, never `drizzle-kit push`

**Failure mode:** `push` reconciles tables but not the hand-authored triggers and
RLS policies — so a `push` against the platform tables **drops your tenant
isolation** while leaving the app apparently working.

**Do:** apply platform schema only with `govcore-migrate` (owner role — set
`GOVCORE_MIGRATE_DATABASE_URL` or `DATABASE_URL`). Your *own* app tables can use
whatever workflow you like; keep the two migration streams separate.

### 5. All tenant access runs inside a `tenantAction`

**Failure mode:** a query outside the tenant transaction has no GUC set → it sees
nothing (or, on the privileged pool, everything). Either way it's wrong.

**Do:** route every tenant-scoped read/write through the `tenantAction` you build
from `createTenantActions`. It resolves the actor server-side (never trusts
input), checks the permission, opens the transaction and sets `app.current_org`,
and hands the handler an audit fn pre-bound to actor + org. It also enforces the
**org lifecycle gate** — a `suspended`/`archived` org runs no tenant transaction
(route it with `onOrgInactive`).

### 6. Audit is not optional, and never holds a secret

**Failure mode:** hand-rolled mutations that forget to attribute an actor, or that
log a password/token into the audit payload.

**Do:** use the generated/ provided mutations — they audit in the same
transaction, attributed to the resolved actor, and never put credentials in the
payload. When you write your own, use the `audit` fn from the action context.

### 7. Keep the middleware `matcher` inline

**Failure mode:** `export const config = { matcher: defaultMatcher }` fails the
build with *"Invalid segment configuration export."* Next.js statically parses
`config.matcher` and rejects any value it can't resolve to a literal — an imported
binding doesn't qualify.

**Do:** inline the array literal; mirror the value of
`@govcore/middleware`'s `defaultMatcher`. See
[`minimal-app/src/middleware.ts`](../examples/minimal-app/src/middleware.ts).

### 8. Compile content types in dependency order

**Failure mode:** a `reference`/`link` field becomes a foreign-key column, so
compiling a type before the type it points at yields a missing-table / FK error.

**Do:** define and compile referenced types first (e.g. `tag` before `article`).
Reads are bounded — the generated `listPage({ page, pageSize })` returns a slice
plus a total; pair it with nextkit's `parsePageParams` and the `DataTable`
`pagination` prop (never an unbounded `list()` on a large table).

### 9. No build config needed

As of the compiled-`dist` release, `@govcore/*` ship ESM + types — a consumer
needs **no `transpilePackages`** and no leaked `@types/*`. If you're carrying
either from an older setup, delete them. See
[`minimal-app/next.config.ts`](../examples/minimal-app/next.config.ts).

---

## Package reference

| Package | You use it for |
|---|---|
| `@govcore/schema` | tables, `GovcoreDb` type, `govcore-migrate`, `isUniqueViolation`, org status |
| `@govcore/setup` | `runSetup` / `bootstrap` / `provisionRuntimeRole` (day-one) |
| `@govcore/auth` | `createAuth({ db, authDb })`, `provisionUser`, password change/reset |
| `@govcore/tenancy` | active-org resolution, membership guards, org + user admin mutations |
| `@govcore/server` | `createTenantActions` (tenant seam), `createOperatorActions` (operator seam) |
| `@govcore/rbac` | `createRbac` over your role/permission map |
| `@govcore/audit` | `writeAuditLog`, `listAuditForOrg` |
| `@govcore/middleware` | `createMiddleware` + `defaultMatcher` (inline it) |
| `@govcore/content` | define-as-data content types → tables, RLS, CRUD actions, screens |
| `@govcore/nextkit` | `AppShell`, `DataTable` (+ pagination), instance-console React |
| `@govcore/support` | break-glass / act-as sessions + views |
| `@govcore/federation` | org connections + cross-org links |
| `@govcore/backup` | whole-tenant export / restore / clone |
| `@govcore/theme` | WCAG-AA base theme + safe brand theming |

For the architecture and the reasoning behind these decisions, see
[`docs/architecture.md`](./architecture.md).
