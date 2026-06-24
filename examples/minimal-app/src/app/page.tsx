export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">GovCore — Minimal App</h1>
      <p className="mt-3 text-muted-foreground">
        A minimal Next.js app built entirely on the <code>@govcore/*</code> platform packages:
        identity, tenancy, RBAC, audit, middleware, the WCAG-AA theme, and the content engine.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href="/instance"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Open instance console
        </a>
        <a href="/notes" className="rounded-md border border-border px-4 py-2 text-sm font-medium">
          Notes (content engine)
        </a>
        <a href="/login" className="rounded-md border border-border px-4 py-2 text-sm font-medium">
          Sign in
        </a>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Demo instance admin: <code>admin@govcore.test</code> / <code>govcore-demo</code>
      </p>
    </main>
  )
}
