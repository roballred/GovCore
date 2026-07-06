---
'@govcore/support': minor
'@govcore/nextkit': minor
---

Support-session read/status layer + presentational surfaces (#67). `@govcore/support` shipped the break-glass/act-as *lifecycle*; every consumer additionally rebuilt the display status and the session queries — and nothing in core enabled the tenant-side visibility the model requires. Now:

`@govcore/support` gains pure status helpers — `breakGlassStatus` (`active`/`pending`/`expired`/`revoked`, with revocation and expiry winning over a pending approval) and `actAsStatus` (`active`/`expired`/`ended`) — plus read helpers `listBreakGlassSessions`/`listActAsSessions` (newest-first; a `targetOrgId` scopes them to one org, which is the tenant-visibility query, or omit it for the operator console view) and `orgHasSupportHistory` for a cheap "has anyone accessed our data?" indicator.

`@govcore/nextkit` gains the presentational surfaces over a `SupportSessionView` (ids resolved to labels, status derived by the consumer): `SupportSessionsTable`, `TenantSupportVisibility` (the org-admin panel that satisfies the "support access is visible to the affected org" rule, with a live-access warning and a reassuring healthy empty state), `ActAsBanner` (the audited-impersonation reminder with an optional End action), `BreakGlassGrantForm`, and `supportStatusTone` (maps a status to a Badge tone — `active` is `danger`, the state to draw the eye). nextkit now depends on `@govcore/support` for the status vocabulary.

The lifecycle mutations already in `@govcore/support` are unchanged; the console *read-side wiring* of these components is tracked in #78.
