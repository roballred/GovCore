# @govcore/nextkit

## 0.1.0

### Minor Changes

- cba7ab0: Phase 4 (part 2) — reusable React. `@govcore/nextkit` ships presentational,
  RSC-friendly instance-console UI styled with the `@govcore/theme` tokens:
  `InstanceConsoleShell`, `PageHeader`, `StatCard`/`StatGrid`, `Badge`, and a
  generic `DataTable`. Data is passed as props (no fetching here), so a consumer
  fetches and renders, and a brand theme restyles it for free.
