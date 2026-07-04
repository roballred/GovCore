---
'@govcore/content': minor
---

Base list/edit/detail patterns for references (#61): `ReferenceDisplay`/`ReferenceDisplayMap` let screens render labels (optionally linked via `hrefBase`) instead of raw uuids in `ContentListScreen`/`ContentDetailScreen`/`contentColumns`; `ContentForm` renders a `<select>` for reference fields when `options` are provided (uuid input remains the fallback), prefilled on edit; `ContentDetailScreen` gains an `actions` header slot (Edit link, publish button); and `parseContentForm(def, formData)` is the canonical FormData→row coercion (empty optional → null, checkbox → boolean) so consumers stop hand-rolling it.
