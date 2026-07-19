---
"@govcore/nextkit": patch
---

Fix branded GroupedSideNav group-header contrast (#135)

The branded tone painted group headers `text-white/60`, which measures ~4.2:1 on the branded rail when the surface carries a white-alpha overlay (an active/hover `bg-white/15`) — just under WCAG AA. Bumped to `text-white/70` (~5.1:1, the value the item links already use and pass at). No API change; branded group labels are marginally brighter. Caught by a consumer's real-browser axe gate; the jsdom unit tests can't evaluate color-contrast.
