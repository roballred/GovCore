// @govcore/setup/cli — the govcore-setup runner + bin.
//
// One idempotent command from an empty database to first login: migrate →
// provision the runtime role → bootstrap the first org/admin. Runs as the
// OWNER/superuser (all three steps are owner operations). Mirrors govcore-migrate's
// bin pattern (no shebang; guarded by the import.meta.url check).

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from '@govcore/schema/migrate'
import { bootstrap, provisionRuntimeRole, type BootstrapResult } from './index'

export interface RunSetupOptions {
  /** Owner/superuser connection string. All three steps are owner operations. */
  connectionString: string
  /** Optional: provision a non-owner runtime role + grants (the two-role split). */
  runtimeRole?: { role: string; password: string; schemas?: string[] }
  /** The first organization + instance-admin to create (skipped if already bootstrapped). */
  organization: { name: string; slug?: string }
  admin: { email: string; name?: string; password: string }
  adminRole?: string
  log?: (message: string) => void
}

export interface RunSetupResult {
  migrationsApplied: string[]
  runtimeRoleProvisioned: boolean
  bootstrap: BootstrapResult
}

/** Migrate → (optional) provision runtime role → bootstrap. Idempotent end to end. */
export async function runSetup(opts: RunSetupOptions): Promise<RunSetupResult> {
  const log = opts.log ?? ((m: string) => console.log(m))

  const { applied } = await migrate({ connectionString: opts.connectionString, log })

  let runtimeRoleProvisioned = false
  if (opts.runtimeRole) {
    await provisionRuntimeRole({
      connectionString: opts.connectionString,
      role: opts.runtimeRole.role,
      password: opts.runtimeRole.password,
      schemas: opts.runtimeRole.schemas,
      log,
    })
    runtimeRoleProvisioned = true
  }

  const client = postgres(opts.connectionString, { max: 1 })
  try {
    const result = await bootstrap(drizzle(client), {
      organization: opts.organization,
      admin: opts.admin,
      adminRole: opts.adminRole,
    })
    if (result.ok) log(`govcore-setup: bootstrapped org ${result.organizationId}`)
    else log(`govcore-setup: bootstrap skipped (${result.reason})`)
    return { migrationsApplied: applied, runtimeRoleProvisioned, bootstrap: result }
  } finally {
    await client.end()
  }
}

/** Read the runner options from environment variables (for the bin). */
function optionsFromEnv(): RunSetupOptions {
  const env = process.env
  const connectionString = env.GOVCORE_SETUP_DATABASE_URL || env.DATABASE_URL
  const require_ = (key: string): string => {
    const v = env[key]
    if (!v) {
      console.error(`govcore-setup: missing required env var ${key}`)
      process.exit(2)
    }
    return v
  }
  if (!connectionString) {
    console.error('govcore-setup: set GOVCORE_SETUP_DATABASE_URL or DATABASE_URL (owner/superuser)')
    process.exit(2)
  }
  const runtimeRole = env.GOVCORE_APP_ROLE
    ? {
        role: env.GOVCORE_APP_ROLE,
        password: require_('GOVCORE_APP_PASSWORD'),
        schemas: env.GOVCORE_APP_SCHEMAS?.split(',').map((s) => s.trim()),
      }
    : undefined
  return {
    connectionString,
    runtimeRole,
    organization: { name: require_('GOVCORE_ORG_NAME'), slug: env.GOVCORE_ORG_SLUG },
    admin: {
      email: require_('GOVCORE_ADMIN_EMAIL'),
      name: env.GOVCORE_ADMIN_NAME,
      password: require_('GOVCORE_ADMIN_PASSWORD'),
    },
    adminRole: env.GOVCORE_ADMIN_ROLE,
  }
}

// Run when invoked as the `govcore-setup` bin.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runSetup(optionsFromEnv())
    .then((r) => {
      if (!r.bootstrap.ok && r.bootstrap.reason !== 'already-bootstrapped') {
        console.error(`govcore-setup: bootstrap failed (${r.bootstrap.reason})`)
        process.exit(1)
      }
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
