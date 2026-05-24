import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RunOrchestratorStubButton } from '@/components/tickets/RunOrchestratorStubButton';
import { StatusPill } from '@/components/tickets/StatusPill';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type TraceRow = {
  id: number;
  seq: number;
  from_agent: string | null;
  to_agent: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type PacketRow = {
  id: string;
  trace_event_id: number | null;
  packet_type: string;
  body_parsed: Record<string, unknown> | null;
  created_at: string;
};

function payloadSummary(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const keys = ['classification', 'verdict', 'reason'] as const;
  const parts: string[] = [];
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === 'string' && v.length > 0) parts.push(`${k}: ${v}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
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
  let briefMeta: { source: string; word_count: number; created_at: string } | null = null;
  if (ticket.brief_id) {
    const { data: brief } = await supabase
      .from('briefs')
      .select('raw_text, source, word_count, created_at')
      .eq('id', ticket.brief_id)
      .maybeSingle();
    briefText = brief?.raw_text ?? null;
    if (brief) {
      briefMeta = {
        source: brief.source as string,
        word_count: brief.word_count as number,
        created_at: brief.created_at as string,
      };
    }
  }

  const preview = briefText ? briefText.slice(0, 1200) : null;
  const truncated = briefText ? briefText.length > 1200 : false;

  const { data: traceData } = await supabase
    .from('trace_events')
    .select('id, seq, from_agent, to_agent, event_type, payload, created_at')
    .eq('ticket_id', ticket.id)
    .order('seq', { ascending: true });
  const traceEvents: TraceRow[] = (traceData ?? []) as TraceRow[];

  const { data: packetData } = await supabase
    .from('packets')
    .select('id, trace_event_id, packet_type, body_parsed, created_at')
    .eq('ticket_id', ticket.id)
    .order('created_at', { ascending: true });
  const packets: PacketRow[] = (packetData ?? []) as PacketRow[];

  const canRunStub = ticket.status === 'open';

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          <Link href={`/w/${workspace.slug}`} className="hover:text-neutral-300">
            {workspace.name}
          </Link>
          {' · '}
          <Link href={`/w/${workspace.slug}/tickets`} className="hover:text-neutral-300">
            Tickets
          </Link>
          {' · '}Ticket
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">{ticket.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          <StatusPill status={ticket.status} />
          {ticket.layer ? <span>Layer: {ticket.layer}</span> : null}
          {ticket.current_agent ? <span>Agent: {ticket.current_agent}</span> : null}
          <span>Opened {new Date(ticket.created_at).toLocaleString()}</span>
        </div>
        {briefMeta ? (
          <p className="text-[11px] text-neutral-500">
            From brief · <span className="font-mono text-neutral-400">{briefMeta.source}</span> ·{' '}
            {briefMeta.word_count} words · {fmtShortDate(briefMeta.created_at)}
          </p>
        ) : null}
      </header>

      {canRunStub ? (
        <section className="space-y-2 rounded border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="text-sm font-medium text-neutral-200">Orchestrator (Phase 1 stub)</h2>
          <RunOrchestratorStubButton slug={workspace.slug} ticketId={ticket.id} />
        </section>
      ) : null}

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
        {traceEvents.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-500">
            Trace events will appear after the Orchestrator runs. Not wired up yet in Phase 1.
          </p>
        ) : (
          <ol className="space-y-2">
            {traceEvents.map((ev) => {
              const summary = payloadSummary(ev.payload);
              const evPackets = packets.filter((p) => p.trace_event_id === ev.id);
              return (
                <li
                  key={ev.id}
                  className="space-y-1 rounded border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-200">
                      #{ev.seq}
                    </span>
                    <span className="font-mono text-neutral-200">{ev.event_type}</span>
                    <span>{ev.from_agent ?? '—'} → {ev.to_agent ?? '—'}</span>
                    <span className="ml-auto text-neutral-500">
                      {new Date(ev.created_at).toLocaleString()}
                    </span>
                  </div>
                  {summary ? (
                    <p className="text-neutral-300">{summary}</p>
                  ) : ev.payload && Object.keys(ev.payload).length > 0 ? (
                    <details className="text-[11px] text-neutral-400">
                      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">payload</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-neutral-900 p-2 font-mono text-[11px] text-neutral-300">
                        {JSON.stringify(ev.payload, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                  {evPackets.length > 0 ? (
                    <ul className="space-y-1 border-t border-neutral-800 pt-1">
                      {evPackets.map((p) => (
                        <li key={p.id} className="text-[11px] text-neutral-400">
                          <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-200">
                            packet:{p.packet_type}
                          </span>{' '}
                          {payloadSummary(p.body_parsed) ?? 'no summary'}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {packets.some((p) => p.trace_event_id === null) ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-200">Unlinked packets</h2>
          <ul className="space-y-1">
            {packets
              .filter((p) => p.trace_event_id === null)
              .map((p) => (
                <li
                  key={p.id}
                  className="rounded border border-neutral-800 bg-neutral-950 p-2 text-[11px] text-neutral-400"
                >
                  <span className="font-mono text-neutral-200">{p.packet_type}</span>{' '}
                  {payloadSummary(p.body_parsed) ?? 'no summary'}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-4 text-xs text-neutral-500">
        <Link
          href={`/w/${workspace.slug}/tickets`}
          className="hover:text-neutral-300"
        >
          ← Back to tickets
        </Link>
        <Link
          href={`/w/${workspace.slug}`}
          className="hover:text-neutral-300"
        >
          ← Back to {workspace.name}
        </Link>
      </div>
    </div>
  );
}
