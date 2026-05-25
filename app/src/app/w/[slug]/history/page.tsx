import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-neutral-500">{workspace.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">History</h1>
        <p className="text-sm text-neutral-400">
          Review completed briefs, tickets, runs, and evidence. Timeline wiring lands in Phase 3 T5.
        </p>
      </header>

      <div className="rounded border border-dashed border-neutral-800 bg-neutral-950 p-6 text-sm text-neutral-400">
        <p>
          No timeline view yet. For now, open{' '}
          <Link
            href={`/w/${workspace.slug}/tickets`}
            className="text-neutral-200 underline-offset-2 hover:underline"
          >
            Tickets
          </Link>{' '}
          to see workspace activity by ticket.
        </p>
      </div>

      <p className="text-[11px] text-neutral-600">
        Placeholder page. No history queries are run yet.
      </p>
    </div>
  );
}
