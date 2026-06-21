# Changesets

GovCore uses [changesets](https://github.com/changesets/changesets) for independent
semver per `@govcore/*` package.

- `pnpm changeset` — record a change (pick packages + bump type + summary)
- `pnpm version-packages` — apply pending changesets, bump versions, update changelogs
- `pnpm release` — publish bumped packages to the registry

Schema changes to `@govcore/schema` are **breaking** for consumers (they imply a
migration): bump **major** unless the change is additive-only. See the design doc §8.
