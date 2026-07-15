---
"@govcore/audit": minor
"@govcore/tenancy": minor
"@govcore/auth": minor
---

Operator-plane mutations now accept optional audit context (#121)

`createOrganization`, `renameOrganization`, `updateUserAdministration` (`@govcore/tenancy`) and `provisionUser` (`@govcore/auth`) gain two optional, additive fields — `auditMetadata?: Record<string, unknown>` and `reason?: string | null` — that a consumer can use to record incident-review context (an instance console's source IP + user-agent, and the operator's stated reason) on the audit event. Both are composed into the event's `metadata` (`reason` normalized to `metadata.reason`) via the new `composeAuditMetadata` helper exported from `@govcore/audit`. Callers that pass nothing are unaffected: `metadata` stays `null`, exactly as before.

This unblocks consumers adopting the console mutations without losing audit fidelity they had in their hand-rolled versions (GovEA #895 / #720).
