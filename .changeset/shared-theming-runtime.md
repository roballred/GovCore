---
'@govcore/theme': minor
'@govcore/nextkit': minor
---

Shared runtime theming so every consumer has the same look, feel, and controls.

- `@govcore/theme`: add the `--header-border` brand token (base.css + allowlist + Tailwind `header.border`); extend `ThemeDefinition` with optional `description`/`preview`/`dark` metadata; add `themesToCss(themes)` to serialize a whole registry into one stylesheet (default under `:root`, each brand under `:root[data-theme="<id>"]`) for refetch-free switching; ship a `starterThemes` registry (`govcoreTheme` + `serviceNowTheme`) plus `THEME_STORAGE_KEY`/`DARK_STORAGE_KEY`. Brand themes still only touch allowlisted accent/header vars — the AA surface/contrast floor is unchanged.
- `@govcore/nextkit`: add `ThemeInitScript` (RSC, applies the saved brand + dark mode before first paint, no FOUC) and a new `@govcore/nextkit/theming` client subpath exporting `DarkModeToggle` and `ThemeSelector`.
