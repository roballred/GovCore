import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { note } from '@/content/note'
import { noteActions } from '@/content/note-actions'
import { ContentDetailScreen } from '@govcore/content/screens'

export const dynamic = 'force-dynamic'

export default async function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const row = await noteActions.get({ id }) // RLS-scoped: a foreign org's id returns null
  if (!row) notFound()

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/notes" className="text-sm text-primary hover:underline">
        ← Notes
      </a>
      <div className="mt-4">
        <ContentDetailScreen def={note} row={row as Record<string, unknown>} />
      </div>
    </main>
  )
}
