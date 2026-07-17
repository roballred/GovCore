---
"@govcore/nextkit": minor
---

GroupedSideNav/SideNav: branded-rail tone, ungrouped top items, open-section DOM hook (#103)

`SideNav` and `GroupedSideNav` gain three optional, additive capabilities so a consumer with a dark brand rail (GovEA) can adopt them alongside the light content sidebar (GovCRM):

- **`tone?: 'surface' | 'branded'`** — `surface` (default) is the existing content-area treatment; `branded` paints white-alpha items and group headers for a rail sitting on `--header-bg`, where the content tokens rendered dark-on-dark. Keys off the header's existing token pair, so brand themes need no new allowlisted surface tokens.
- **`topItems?: NavItem[]`** on `GroupedSideNav` — ungrouped links rendered flat above the sections, with the same active/tone treatment.
- **`className?: string`** — replaces the default `w-48` sizing for a rail that owns its own width (substitutes rather than appends, so the emitted width stays deterministic).

Each section also now carries a **`data-nav-group="<label>"`** attribute: a stable DOM hook for persisting the open section or opening one imperatively (a product tour), without a controlled React accordion that would force the nav to `'use client'` and ship JS to consumers that never need it.

All defaults are unchanged — a consumer passing none of the new props renders exactly as before.
