import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadAgentCatalog, groupAgents } from '@/lib/agents/catalog';
import { AgentCatalog } from '@/components/agents/AgentCatalog';

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

  const entries = await loadAgentCatalog();
  const groups = groupAgents(entries);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-neutral-500">{workspace.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Agents</h1>
        <p className="text-sm text-neutral-400">
          Dream Team roles parsed from the checked-in prompt library. Read-only.
        </p>
      </header>

      <AgentCatalog groups={groups} total={entries.length} />
    </div>
  );
}
