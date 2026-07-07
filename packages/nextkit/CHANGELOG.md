# @govcore/nextkit

## 0.3.0

### Minor Changes

- 2b7d55e: Support-session read/status layer + presentational surfaces (#67). `@govcore/support` shipped the break-glass/act-as _lifecycle_; every consumer additionally rebuilt the display status and the session queries — and nothing in core enabled the tenant-side visibility the model requires. Now:

  `@govcore/support` gains pure status helpers — `breakGlassStatus` (`active`/`pending`/`expired`/`revoked`, with revocation and expiry winning over a pending approval) and `actAsStatus` (`active`/`expired`/`ended`) — plus read helpers `listBreakGlassSessions`/`listActAsSessions` (newest-first; a `targetOrgId` scopes them to one org, which is the tenant-visibility query, or omit it for the operator console view) and `orgHasSupportHistory` for a cheap "has anyone accessed our data?" indicator.

  `@govcore/nextkit` gains the presentational surfaces over a `SupportSessionView` (ids resolved to labels, status derived by the consumer): `SupportSessionsTable`, `TenantSupportVisibility` (the org-admin panel that satisfies the "support access is visible to the affected org" rule, with a live-access warning and a reassuring healthy empty state), `ActAsBanner` (the audited-impersonation reminder with an optional End action), `BreakGlassGrantForm`, and `supportStatusTone` (maps a status to a Badge tone — `active` is `danger`, the state to draw the eye). nextkit now depends on `@govcore/support` for the status vocabulary.

  The lifecycle mutations already in `@govcore/support` are unchanged; the console _read-side wiring_ of these components is tracked in #78.

### Patch Changes

- Updated dependencies [2b7d55e]
  - @govcore/support@0.2.0

## 0.2.0

### Minor Changes

- d24e883: Add the product-plane app shell: `AppShell` (branded header with user/actions slots + left sidebar + main), `SideNav` (presentational nav list; consumers pass `active`), and `ThemeStyle` (one-line brand-theme injection from `@govcore/theme`'s `defineTheme`). `InstanceConsoleShell` now composes `AppShell` with identical rendered behavior. Closes the every-consumer-rebuilds-the-shell gap (#58).

## 0.1.0

### Minor Changes

- cba7ab0: Phase 4 (part 2) — reusable React. `@govcore/nextkit` ships presentational,
  RSC-friendly instance-console UI styled with the `@govcore/theme` tokens:
  `InstanceConsoleShell`, `PageHeader`, `StatCard`/`StatGrid`, `Badge`, and a
  generic `DataTable`. Data is passed as props (no fetching here), so a consumer
  fetches and renders, and a brand theme restyles it for free.
