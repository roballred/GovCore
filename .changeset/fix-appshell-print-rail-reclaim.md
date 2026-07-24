---
"@govcore/nextkit": patch
---

AppShell `fixed-rail`: reclaim the rail's width in print (#148)

The rail is `print:hidden`, but its `pl-56`/`lg:pl-56` offset on the content
wrapper stayed applied when printing, leaving a ~14rem empty gutter that shoved
exported/PDF content into a narrow right-hand column and wrapped long labels
early. The content wrapper now carries `print:pl-0`, so in print the reclaimed
rail space is usable and content spans the full page. `print:` beats the
responsive offset the same way the rail's own `print:hidden` beats `lg:flex`.

No on-screen change and no API change (both the `mobileNav` `lg:pl-56` and the
solo `pl-56` variants are covered). Consumers shipping an app-side stopgap
(e.g. GovEA's `@media print { .lg\:pl-56, .pl-56 { padding-left: 0 } }`) can
drop it once they pick up this release.
