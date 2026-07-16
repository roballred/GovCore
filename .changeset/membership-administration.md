---
"@govcore/tenancy": minor
---

Add `updateMembershipAdministration` — per-(user, org) membership mutation (#124)

The membership-scoped counterpart to `updateUserAdministration`. Where that one administers a **user** (home org + denormalized `users` columns + the instance-admin grant), this administers one explicit `(userId, organizationId)` membership and touches **only that membership row** — the operation an instance console needs when a user belongs to more than one org and the operator changes their role or active state in a specific, possibly non-home, org.

Guards the org's last active admin inside the transaction, audits `platform.membership.update` (carrying optional `auditMetadata`/`reason` per #121), returns typed `not-found` for a missing membership (minting no row) and `last-admin` when the change would orphan the org. Proven in `examples/smoke`.
