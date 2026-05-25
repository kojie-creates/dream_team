import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadAgentBySlug } from '@/lib/agents/catalog';

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string; agentId: string }>;
}) {
  const { slug, agentId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  const agent = await loadAgentBySlug(agentId);
  if (!agent) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/w/${workspace.slug}/agents`}
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          ← Agents
        </Link>
      </div>

      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-neutral-500">{workspace.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">{agent.title}</h1>
        <p className="text-[11px] text-neutral-500">
          <code>{agent.slug}</code> · {agent.group}
        </p>
      </header>

      {agent.description ? (
        <section className="rounded border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500">Summary</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300">{agent.description}</p>
        </section>
      ) : null}

      <section className="rounded border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500">Metadata</h2>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-xs text-neutral-400 sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Source</dt>
            <dd className="mt-1 break-all text-neutral-300">
              <code>{agent.sourcePath}</code>
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Group</dt>
            <dd className="mt-1 text-neutral-300">{agent.group}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Mode</dt>
            <dd className="mt-1 text-neutral-300">Read-only</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500">Prompt source</h2>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded border border-neutral-800 bg-neutral-950 p-4 text-[12px] leading-relaxed text-neutral-300">
          {agent.body}
        </pre>
      </section>

      <p className="text-[11px] text-neutral-500">
        This page displays checked-in prompt source from <code>agents/</code>. It does not execute
        the agent.
      </p>
    </div>
  );
}
