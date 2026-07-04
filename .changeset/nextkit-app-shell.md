---
'@govcore/nextkit': minor
---

Add the product-plane app shell: `AppShell` (branded header with user/actions slots + left sidebar + main), `SideNav` (presentational nav list; consumers pass `active`), and `ThemeStyle` (one-line brand-theme injection from `@govcore/theme`'s `defineTheme`). `InstanceConsoleShell` now composes `AppShell` with identical rendered behavior. Closes the every-consumer-rebuilds-the-shell gap (#58).
