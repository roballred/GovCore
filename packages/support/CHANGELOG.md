# @govcore/support

## 0.1.0

### Minor Changes

- Phase 4 — `@govcore/support`: instance-operator support access.

  break-glass: `requireBreakGlass` / `getUnlockedOrgIds` gates and the audited
  `grantBreakGlass` / `approveBreakGlass` / `revokeBreakGlass` lifecycle (grants
  over the threshold require a second admin; TTL counts from grant time). act-as:
  `startActAsSession` / `requireActAs` / `getActiveActAsSession` /
  `endActAsSession` — framework-agnostic (the caller supplies the session id), with
  a child that can never outlive its parent and self-terminates on a parent revoke.

### Patch Changes

- Updated dependencies
- Updated dependencies [f2f3743]
  - @govcore/audit@0.1.0
  - @govcore/schema@0.1.0
