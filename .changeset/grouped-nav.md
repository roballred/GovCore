---
'@govcore/nextkit': minor
---

Grouped, collapsible sidebar nav so consumers can match GovEA's sectioned shell (GovCore #92).

- `GroupedSideNav` + `NavGroup` — collapsible sections over the same items as `SideNav`. Presentational and client-hook-free: collapsing uses a native `<details>` exclusive accordion (groups share a `name`, so opening one closes the others) and the consumer marks the current section `defaultOpen`. Role/module gating stays the consumer's job (filter groups/items before passing them in, same contract as the pre-computed `active`).
- `AppShell` now accepts a `NavGroup[]` for `nav` (renders `GroupedSideNav`) in addition to the existing flat `NavItem[]` and `ReactNode` forms.
