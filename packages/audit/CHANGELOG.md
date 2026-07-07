# @govcore/audit

## 0.1.1

### Patch Changes

- Updated dependencies [d255afc]
  - @govcore/schema@0.2.0

## 0.1.0

### Minor Changes

- Phase 2 — audit and tenancy.

  `@govcore/audit`: the typed `writeAuditLog` writer (participates in the caller's
  transaction; not fail-silent) plus `listAuditForOrg`. The append-only guarantee
  itself is the Postgres trigger shipped by `@govcore/schema`.

  `@govcore/tenancy`: `resolveActiveMembership` — the single server-side answer to
  "which org am I acting in" (last-selected → primary → oldest active membership),
  plus `activeMembershipCountByRole`. Roles are app-defined `text`.

### Patch Changes

- Updated dependencies [f2f3743]
  - @govcore/schema@0.1.0
