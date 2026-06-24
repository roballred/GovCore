---
"@govcore/content": minor
---

Generated React screens for a content type, on the `@govcore/content/screens` subpath.

The same `ContentTypeDefinition` that compiles to a table and CRUD tenantActions now derives its UI: `contentColumns`/`contentFormFields` pure derivation helpers plus presentational, RSC-friendly `ContentListScreen`, `ContentDetailScreen`, and `ContentForm` (a plain `<form action={serverAction}>`, no client hooks) built on `@govcore/nextkit` + the base theme. Exposed on a separate subpath so the server entry stays React-free. React is an optional peer dependency.
