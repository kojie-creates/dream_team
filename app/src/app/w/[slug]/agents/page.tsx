import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function AgentsPage({
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

  const rows = [
    {
      label: 'Orchestrator',
      description: 'Classifies briefs and routes work across layers.',
    },
    {
      label: 'Specialists',
      description: 'One per layer: build, research, operate, distribution, learning.',
    },
    {
      label: 'Review agents',
      description: 'QA and Truth Agent record internal validation evidence.',
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-neutral-500">{workspace.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Agents</h1>
        <p className="text-sm text-neutral-400">
          Browse Dream Team roles and contracts. Catalog wiring lands in Phase 3 T2.
        </p>
      </header>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.label}
            className="rounded border border-neutral-800 bg-neutral-950 p-4"
          >
            <p className="text-sm font-medium text-neutral-100">{r.label}</p>
            <p className="text-xs text-neutral-500">{r.description}</p>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-neutral-600">
        Placeholder rows only. No agent metadata is loaded from the prompt library yet.
      </p>
    </div>
  );
}
