import { desc } from 'drizzle-orm'
import { db } from '@/db/client'
import { auditLog, organizations, userOrganizationMemberships, users } from '@/db/schema'
import { auth, signOut } from '@/lib/auth'
import {
  Badge,
  DataTable,
  InstanceConsoleShell,
  PageHeader,
  StatCard,
  StatGrid,
} from '@govcore/nextkit'

export const dynamic = 'force-dynamic'

export default async function InstancePage() {
  const session = await auth()

  // Instance admin is cross-organization: read across all orgs.
  const [orgs, allUsers, memberships, audits] = await Promise.all([
    db.select().from(organizations),
    db.select().from(users),
    db.select().from(userOrganizationMemberships),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(8),
  ])

  const nav = [
    { href: '/instance', label: 'Overview', active: true },
    { href: '/instance#orgs', label: 'Organizations' },
    { href: '/instance#users', label: 'Users' },
    { href: '/instance#audit', label: 'Audit log' },
  ]

  return (
    <InstanceConsoleShell title="GovCore · Instance Console" nav={nav} user={session?.user}>
      <PageHeader title="Overview" description="Cross-organization view for instance administrators." />

      <StatGrid>
        <StatCard label="Organizations" value={orgs.length} />
        <StatCard label="Users" value={allUsers.length} />
        <StatCard label="Memberships" value={memberships.length} />
        <StatCard label="Audit events" value={audits.length} />
      </StatGrid>

      <section id="orgs" className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Organizations</h2>
        <DataTable
          rows={orgs as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'slug', header: 'Slug', cell: (r) => <Badge tone="muted">{String(r.slug)}</Badge> },
            {
              key: 'createdAt',
              header: 'Created',
              cell: (r) => new Date(r.createdAt as string).toLocaleDateString(),
            },
          ]}
        />
      </section>

      <section id="users" className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Users</h2>
        <DataTable
          rows={allUsers as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'email', header: 'Email' },
            { key: 'role', header: 'Role', cell: (r) => <Badge>{String(r.role ?? '—')}</Badge> },
            {
              key: 'instanceRole',
              header: 'Instance',
              cell: (r) =>
                r.instanceRole ? <Badge tone="danger">{String(r.instanceRole)}</Badge> : '—',
            },
            { key: 'isActive', header: 'Active', cell: (r) => (r.isActive ? 'Yes' : 'No') },
          ]}
        />
      </section>

      <section id="audit" className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Recent audit events</h2>
        <DataTable
          empty="No audit events yet."
          rows={audits as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'action', header: 'Action', cell: (r) => <Badge tone="muted">{String(r.action)}</Badge> },
            { key: 'entityType', header: 'Entity' },
            {
              key: 'createdAt',
              header: 'When',
              cell: (r) => new Date(r.createdAt as string).toLocaleString(),
            },
          ]}
        />
      </section>

      <form
        action={async () => {
          'use server'
          await signOut({ redirectTo: '/' })
        }}
        className="mt-10"
      >
        <button className="rounded-md border border-border px-3 py-1.5 text-sm">Sign out</button>
      </form>
    </InstanceConsoleShell>
  )
}
