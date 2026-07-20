---
'@govcore/nextkit': minor
---

AppShell: responsive mobile nav via a new `MobileNavDrawer` (#102 gap 2)

`@govcore/nextkit/client` gains `MobileNavDrawer` — a hamburger + slide-in drawer with backdrop, Escape-to-close, body-scroll lock, focus move/restore, and an `inert` closed panel. Pass it as `AppShell`'s new `mobileNav` prop and the desktop rail collapses to the drawer below `lg`.

Backwards compatible: omit `mobileNav` and the shell renders exactly as before.

It ships as a slot rather than built into `AppShell` because `AppShell` lives in the RSC-only entry, and importing a `'use client'` module there strips the directive from `dist/index.js` (#138) — breaking npm consumers while source-first consumers stay green. The presentational nav renderers moved to an internal, hook-free `./nav` module so both entries share them without crossing the boundary.
