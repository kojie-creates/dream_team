import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  open: { label: 'Open', tone: 'bg-neutral-800 text-neutral-200' },
  in_progress: { label: 'In progress', tone: 'bg-sky-950 text-sky-200' },
  needs_input: { label: 'Needs input', tone: 'bg-amber-950 text-amber-200' },
  done: { label: 'Done', tone: 'bg-emerald-950 text-emerald-200' },
  failed: { label: 'Failed', tone: 'bg-red-950 text-red-200' },
  looped: { label: 'Looped', tone: 'bg-fuchsia-950 text-fuchsia-200' },
};

function StatusPill({ status }: { status: string }) {
  const v = STATUS_COPY[status] ?? { label: status, tone: 'bg-neutral-800 text-neutral-200' };
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${v.tone}`}>
      {v.label}
    </span>
  );
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ slug: string; ticketId: string }>;
}) {
  const { slug, ticketId } = await params;
  if (!UUID_RE.test(ticketId)) notFound();

  const supabase = await createSupabaseServerClient();

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, title, status, layer, current_agent, created_at, brief_id')
    .eq('id', ticketId)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (!ticket) notFound();

  let briefText: string | null = null;
  if (ticket.brief_id) {
    const { data: brief } = await supabase
      .from('briefs')
      .select('raw_text, source, word_count')
      .eq('id', ticket.brief_id)
      .maybeSingle();
    briefText = brief?.raw_text ?? null;
  }

  const preview = briefText ? briefText.slice(0, 1200) : null;
  const truncated = briefText ? briefText.length > 1200 : false;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          {workspace.name} · Ticket
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">{ticket.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          <StatusPill status={ticket.status} />
          {ticket.layer ? <span>Layer: {ticket.layer}</span> : null}
          {ticket.current_agent ? <span>Agent: {ticket.current_agent}</span> : null}
          <span>Opened {new Date(ticket.created_at).toLocaleString()}</span>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-200">Source brief</h2>
        {preview ? (
          <pre className="whitespace-pre-wrap rounded border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs leading-relaxed text-neutral-200">
            {preview}
            {truncated ? '\n…' : ''}
          </pre>
        ) : (
          <p className="rounded border border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-500">
            No brief attached to this ticket.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-200">Trace</h2>
        <p className="rounded border border-dashed border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-500">
          Trace events will appear after the Orchestrator runs. Not wired up yet in Phase 1.
        </p>
      </section>

      <Link
        href={`/w/${workspace.slug}`}
        className="inline-block text-xs text-neutral-500 hover:text-neutral-300"
      >
        ← Back to {workspace.name}
      </Link>
    </div>
  );
}
