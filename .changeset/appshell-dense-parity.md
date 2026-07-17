---
"@govcore/nextkit": minor
---

AppShell: fluid width, skip-link + landmarks, print-clean chrome, header search slot (#102)

Four additive capabilities a dense product-plane consumer (GovEA) needs before it can retire its bespoke shell. All defaults are unchanged — an existing consumer renders exactly as before:

- **`width?: 'contained' | 'fluid'`** — `contained` (default) keeps the centered `max-w-6xl` reading column; `fluid` runs full width so dense content (graphs, heatmaps, wide entity tables) isn't clipped to 1152px.
- **Skip-link + landmarks** — emits a "Skip to main content" link (WCAG 2.4.1) targeting a `<main id>` landmark, alongside `banner`/`navigation`/`main`. Configurable via `mainId` / `skipLinkLabel`. Proven against axe A/AA structural rules in a jsdom test.
- **Print-clean chrome** — the header and sidebar are `print:hidden`, so a consumer's exported handout prints as just the content. `<main>` is never hidden.
- **`search?: ReactNode`** — a header slot between the title and `actions`, so a dense header composes without cramming a search box into `actions`.
- **`navTone?: NavTone`** — passes through to the built-in `SideNav`/`GroupedSideNav` for a branded rail.

Responsive mobile nav (a drawer below `lg`) is **not** included and remains consumer-owned — it needs client interactivity, unlike the above; tracked as the remaining gap on #102.
