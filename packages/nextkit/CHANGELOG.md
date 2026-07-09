# @govcore/nextkit

## 0.5.1

### Patch Changes

- @govcore/support@0.2.3

## 0.5.0

### Minor Changes

- 62a4bc4: Grouped, collapsible sidebar nav so consumers can match GovEA's sectioned shell (GovCore #92).

  - `GroupedSideNav` + `NavGroup` — collapsible sections over the same items as `SideNav`. Presentational and client-hook-free: collapsing uses a native `<details>` exclusive accordion (groups share a `name`, so opening one closes the others) and the consumer marks the current section `defaultOpen`. Role/module gating stays the consumer's job (filter groups/items before passing them in, same contract as the pre-computed `active`).
  - `AppShell` now accepts a `NavGroup[]` for `nav` (renders `GroupedSideNav`) in addition to the existing flat `NavItem[]` and `ReactNode` forms.

- 34d3827: Shared runtime theming so every consumer has the same look, feel, and controls.

  - `@govcore/theme`: add the `--header-border` brand token (base.css + allowlist + Tailwind `header.border`); extend `ThemeDefinition` with optional `description`/`preview`/`dark` metadata; add `themesToCss(themes)` to serialize a whole registry into one stylesheet (default under `:root`, each brand under `:root[data-theme="<id>"]`) for refetch-free switching; ship a `starterThemes` registry (`govcoreTheme` + `serviceNowTheme`) plus `THEME_STORAGE_KEY`/`DARK_STORAGE_KEY`. Brand themes still only touch allowlisted accent/header vars — the AA surface/contrast floor is unchanged.
  - `@govcore/nextkit`: add `ThemeInitScript` (RSC, applies the saved brand + dark mode before first paint, no FOUC) and a new `@govcore/nextkit/theming` client subpath exporting `DarkModeToggle` and `ThemeSelector`.

### Patch Changes

- Updated dependencies [34d3827]
  - @govcore/theme@0.2.0

## 0.4.0

### Minor Changes

- 9f85ca0: Server-driven pagination for list views (#72) — no more silent `limit(50)` ceilings.

  `@govcore/nextkit`: `DataTable` gains an optional `pagination` prop that renders a prev/next + "Showing X–Y of Z" footer as plain links (no client JS — works in a Server Component). New pure helpers: `parsePageParams(searchParams)` reads and clamps `page`/`pageSize` from App Router `searchParams` (a hand-edited URL can't produce a negative offset or an unbounded query), and `pageHref(pathname, searchParams, page)` builds a page link that preserves the other query params. Also exports `TablePagination`, `PageParams`, `PaginationProps`, and `DEFAULT_PAGE_SIZE`.

  `@govcore/content`: generated actions gain `listPage({ page?, pageSize? }) → { rows, total, page, pageSize }` (LIMIT/OFFSET slice + total count, same clamping), and `ContentListScreen` takes a `pagination` prop it passes through — so `parsePageParams` → `listPage` → screen paginates a content list end to end. `list()` (all rows) is unchanged; this is additive.

### Patch Changes

- @govcore/support@0.2.2

## 0.3.1

### Patch Changes

- fbd5dc1: Ship compiled builds — retire source-first packaging (#71, closes #56).

  Every package published `main: ./src/index.ts`, which pushed core's build internals onto consumers: internal type deps leaked (a consumer needed `@types/bcryptjs` just to typecheck `@govcore/auth`, #56), every Next.js app had to list all 14 packages in `transpilePackages`, and non-Next/Node consumers couldn't consume the TS source at all.

  Each package now builds with **tsup** to ESM + `.d.ts` + sourcemaps in `dist/`, with `exports`/`main`/`types` pointing at the compiled output and `files` limited to what ships (`dist`, plus `migrations/` for schema and `base.css` for theme). Intra-package modules are bundled; `dependencies`/`peerDependencies` (the other `@govcore/*` packages, drizzle, react, …) stay external. Multi-entry packages keep their subpaths compiled — `@govcore/auth/password`, `@govcore/content/screens`, `@govcore/schema/migrate`; the `govcore-migrate` bin still resolves `../migrations` from `dist/`.

  Non-breaking: a consumer that keeps `transpilePackages` for these keeps working (transpiling already-compiled ESM is a no-op) — but no longer needs it, or any of core's internal `@types`. Proven by the canary (`examples/minimal-app`) now building with an empty `next.config`, and by a CI build step so both the canary and the smoke resolve the compiled `dist/` rather than source.

- Updated dependencies [fbd5dc1]
  - @govcore/theme@0.1.1
  - @govcore/support@0.2.1

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
