---
"@govcore/backup": minor
---

Add cross-org clone to `@govcore/backup`. `importOrg` preserves UUIDs (same-org
restore); `cloneOrgInto(db, registry, bundle, { targetOrgId, forceFields?, newId? })`
copies a bundle into a *different* org with regenerated primary keys, remapping
declared references to the cloned rows so foreign keys stay valid — additive, so
the clone coexists with the source. The registry gains optional `pkField` and
`references` for this; `importOrg` is unchanged. Pure helpers `buildIdMaps` and
`remapRowIds` are exported.
