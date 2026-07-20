---
'@govcore/nextkit': minor
---

AppShell: fixed-rail layout, focusable `<main>`, and `mainProps` (#141)

Closes the last three gaps between `AppShell` and GovEA's bespoke shell, so GovEA can retire `app-shell.tsx` (GovEA #898 phase 2b).

- **`layout="fixed-rail"`** — a full-height rail pinned to the left edge with a sticky header beside it, instead of the in-flow `flow` arrangement. Dense apps keep their nav and header on screen while content scrolls. Pair it with `mobileNav`; without one the rail stays visible at every breakpoint (and the content offset matches it), since a hidden rail and no drawer would mean no nav at all. `railHeader` fills the rail's top row.
- **`<main>` now carries `tabIndex={-1}`** in both layouts. A skip link pointing at a non-focusable element scrolls the viewport but leaves focus in the nav — the exact failure WCAG 2.4.1 exists to prevent. axe cannot detect the difference, since the link and its target both exist either way, so this defaults on rather than being left to consumers.
- **`mainProps`** reaches the `<main>` element for consumer-specific attributes such as GovEA's `data-print-main`, which its print stylesheet keys the content padding reset off. `className` merges with the shell's own rather than replacing it.

Backwards compatible: `layout` defaults to `flow` and that markup is unchanged apart from the new `tabIndex`.
