// @govcore/schema/migrate — the govcore-migrate runner.
//
// NOT edge-safe (uses node:fs + a postgres client). Applies the authored
// platform migrations in ../migrations in lexical order, each in its own
// transaction, tracked in `govcore.__govcore_migrations` — kept separate from
// the app's own Drizzle journal so the two migration streams never overlap
// (design §5).
//
// Runs as the OWNER / DDL role (design §13.2): set GOVCORE_MIGRATE_DATABASE_URL
// to the owning role's connection string; falls back to DATABASE_URL. The app
// runtime connects as a separate NON-OWNER role, which RLS binds.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

export interface MigrateOptions {
  /** Connection string for the owner/DDL role. Defaults to env. */
  connectionString?: string
  /** Optional logger; defaults to console.log. */
  log?: (message: string) => void
}

/** Apply all pending platform migrations. Idempotent — already-applied files are skipped. */
export async function migrate(options: MigrateOptions = {}): Promise<{ applied: string[] }> {
  const connectionString =
    options.connectionString ??
    process.env.GOVCORE_MIGRATE_DATABASE_URL ??
    process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'govcore-migrate: set GOVCORE_MIGRATE_DATABASE_URL (owner role) or DATABASE_URL',
    )
  }
  const log = options.log ?? ((m: string) => console.log(m))
  const sql = postgres(connectionString, { max: 1 })
  const applied: string[] = []
  try {
    await sql.unsafe('CREATE SCHEMA IF NOT EXISTS govcore')
    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS govcore.__govcore_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    )

    const done = new Set(
      (await sql`SELECT name FROM govcore.__govcore_migrations`).map((r) => r.name as string),
    )
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      if (done.has(file)) continue
      const ddl = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      await sql.begin(async (tx) => {
        await tx.unsafe(ddl)
        await tx`INSERT INTO govcore.__govcore_migrations (name) VALUES (${file})`
      })
      applied.push(file)
      log(`govcore-migrate: applied ${file}`)
    }

    log(
      applied.length
        ? `govcore-migrate: applied ${applied.length} migration(s)`
        : 'govcore-migrate: already up to date',
    )
    return { applied }
  } finally {
    await sql.end()
  }
}

// Run when invoked as the `govcore-migrate` bin.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
