---
"@govcore/federation": minor
---

Add the cross-org content-link lifecycle to `@govcore/federation`. Entity types
and `linkType` are app-defined strings; the app validates entity
ownership/visibility, this owns the link record:

- reads — `getCrossOrgLinks`, `getLinksForEntity`, `findCrossOrgLink`;
- lifecycle (audited) — `requestCrossOrgLink` (blocks an existing pending/active
  pair, reactivates a rejected one), `approveCrossOrgLink` / `rejectCrossOrgLink`
  (target org only), `withdrawCrossOrgLink` (source org), `revokeCrossOrgLink`
  (target org, active only);
- review flags + connection cleanup — `flagLinksForVisibilityDrop`,
  `clearLinksFlag`, `removeLinksForConnection`;
- pure helper `resolveLinkRequest`.
