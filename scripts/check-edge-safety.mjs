// Edge-safety gate (design §575): assert the packages a consumer imports in an
// edge runtime — @govcore/{schema,rbac,middleware} — pull in no `node:` builtin
// and no SQL client. "A regression here silently breaks every consumer's
// middleware." Run in CI on every push.
//
// How: bundle each package's MAIN entry with esbuild for an edge-like target
// (worker/edge-light/browser conditions) and inspect the import graph. A
// `node:*` builtin or a DB client (postgres/pg) in the graph fails the gate.
// `next` and `react` are provided by the runtime, so they're external.
//
// The server-only `@govcore/schema/migrate` subpath (node:fs/path/url) is
// intentionally NOT checked — it's a migration runner, never imported in edge.

import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..'

// The packages a consumer imports in an edge runtime, by workspace directory.
// Resolved to each package's own entry so esbuild follows imports (incl.
// cross-package `@govcore/*`) from the package's own node_modules.
const TARGETS = [
  { name: '@govcore/schema', dir: 'packages/schema' },
  { name: '@govcore/rbac', dir: 'packages/rbac' },
  { name: '@govcore/middleware', dir: 'packages/middleware' },
]

/** The package's main entry file, from its package.json. */
function entryOf(dir) {
  const pkgDir = resolve(ROOT, dir)
  const pkg = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'))
  const main = pkg.main ?? pkg.exports?.['.']?.default ?? pkg.exports?.['.']?.import ?? './src/index.ts'
  return resolve(pkgDir, main)
}
// Runtime-provided in an edge/Next environment — not our edge-safety concern.
const EXTERNAL = ['next', 'next/*', 'react', 'react-dom', 'react/jsx-runtime', 'server-only']
// DB clients that must never reach an edge bundle.
const DB_CLIENTS = /(^|\/)node_modules\/(\.pnpm\/[^/]*\/node_modules\/)?(postgres|pg|pg-pool)([@/]|$)/

const failures = []

for (const { name, dir } of TARGETS) {
  let entry
  try {
    entry = entryOf(dir)
  } catch (err) {
    failures.push(`${name}: could not resolve entry — ${err.message}`)
    continue
  }

  let result
  try {
    result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      conditions: ['edge-light', 'worker', 'browser', 'import'],
      metafile: true,
      logLevel: 'silent',
      external: EXTERNAL,
    })
  } catch (err) {
    // esbuild fails to resolve a `node:` builtin on the browser platform — the
    // clearest edge-unsafe signal.
    const msgs = (err.errors ?? []).map((e) => e.text).join(' | ')
    failures.push(`${name}: bundle failed (edge-unsafe import) — ${msgs || err.message}`)
    continue
  }

  const inputs = Object.keys(result.metafile.inputs)
  const nodeBuiltins = inputs.filter((i) => i.startsWith('node:'))
  const dbClients = inputs.filter((i) => DB_CLIENTS.test(i))
  if (nodeBuiltins.length || dbClients.length) {
    const bad = [...nodeBuiltins, ...dbClients].join(', ')
    failures.push(`${name}: edge-unsafe dependency in graph — ${bad}`)
  } else {
    console.log(`  ✓ ${name} — edge-safe`)
  }
}

if (failures.length) {
  console.error('\n✗ edge-safety gate FAILED:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\n✅ edge-safety gate passed — schema/rbac/middleware are edge-clean')
