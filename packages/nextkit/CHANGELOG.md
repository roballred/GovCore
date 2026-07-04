# @govcore/nextkit

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
