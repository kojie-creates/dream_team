import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const KINDS = ['all', 'tickets', 'briefs', 'runs', 'trace', 'packets', 'artifacts'] as const;
type KindFilter = (typeof KINDS)[number];

const KIND_LABEL: Record<KindFilter, string> = {
  all: 'All',
  tickets: 'Tickets',
  briefs: 'Briefs',
  runs: 'Runs',
  trace: 'Trace',
  packets: 'Packets',
  artifacts: 'Artifacts',
};

type ItemKind = 'ticket' | 'brief' | 'run' | 'trace' | 'packet' | 'artifact';

const KIND_TONE: Record<ItemKind, string> = {
  ticket: 'bg-sky-950 text-sky-200',
  brief: 'bg-neutral-800 text-neutral-200',
  run: 'bg-fuchsia-950 text-fuchsia-200',
  trace: 'bg-amber-950 text-amber-200',
  packet: 'bg-emerald-950 text-emerald-200',
  artifact: 'bg-violet-950 text-violet-200',
};

type HistoryItem = {
  id: string;
  kind: ItemKind;
  title: string;
  subtitle: string;
  timestamp: string;
  ticketId: string | null;
  href: string | null;
  meta?: string;
};

const LIMIT_PER_SOURCE = 50;
const TOTAL_CAP = 50;

function parseKind(input: string | string[] | undefined): KindFilter {
  if (typeof input !== 'string') return 'all';
  return (KINDS as readonly string[]).includes(input) ? (input as KindFilter) : 'all';
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function previewText(raw: string | null | undefined, max = 140): string {
  if (!raw) return '';
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) + '…' : flat;
}

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const { slug } = await params;
  const { kind: rawKind } = await searchParams;
  const filter = parseKind(rawKind);

  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  const wsId = workspace.id as string;
  const linkPrefix = `/w/${workspace.slug}`;

  const [ticketsRes, briefsRes, runsRes, traceRes, packetsRes, artifactsRes] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, title, status, layer, current_agent, updated_at')
      .eq('workspace_id', wsId)
      .order('updated_at', { ascending: false })
      .limit(LIMIT_PER_SOURCE),
    supabase
      .from('briefs')
      .select('id, source, word_count, raw_text, created_at')
      .eq('workspace_id', wsId)
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_SOURCE),
    supabase
      .from('workflow_runs')
      .select('id, ticket_id, run_kind, agent_id, model, status, started_at')
      .eq('workspace_id', wsId)
      .order('started_at', { ascending: false })
      .limit(LIMIT_PER_SOURCE),
    supabase
      .from('trace_events')
      .select('id, ticket_id, seq, event_type, from_agent, to_agent, created_at')
      .eq('workspace_id', wsId)
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_SOURCE),
    supabase
      .from('packets')
      .select('id, ticket_id, packet_type, body_parsed, created_at')
      .eq('workspace_id', wsId)
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_SOURCE),
    supabase
      .from('artifacts')
      .select('id, ticket_id, kind, mime_type, bytes, created_at')
      .eq('workspace_id', wsId)
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_SOURCE),
  ]);

  type TicketLite = {
    id: string;
    title: string;
    status: string;
    layer: string | null;
    current_agent: string | null;
    updated_at: string;
  };
  const tickets = (ticketsRes.data ?? []) as TicketLite[];
  const titleMap = new Map<string, string>(tickets.map((t) => [t.id, t.title]));

  const referencedTicketIds = new Set<string>();
  for (const r of (runsRes.data ?? []) as Array<{ ticket_id: string }>) referencedTicketIds.add(r.ticket_id);
  for (const e of (traceRes.data ?? []) as Array<{ ticket_id: string }>) referencedTicketIds.add(e.ticket_id);
  for (const p of (packetsRes.data ?? []) as Array<{ ticket_id: string }>) referencedTicketIds.add(p.ticket_id);
  for (const a of (artifactsRes.data ?? []) as Array<{ ticket_id: string | null }>) {
    if (a.ticket_id) referencedTicketIds.add(a.ticket_id);
  }
  const missingTitleIds = Array.from(referencedTicketIds).filter((id) => !titleMap.has(id));
  if (missingTitleIds.length > 0) {
    const { data: extra } = await supabase
      .from('tickets')
      .select('id, title')
      .in('id', missingTitleIds);
    for (const row of (extra ?? []) as Array<{ id: string; title: string }>) {
      titleMap.set(row.id, row.title);
    }
  }

  const items: HistoryItem[] = [];

  for (const t of tickets) {
    const subBits: string[] = [`status: ${t.status}`];
    if (t.layer) subBits.push(`layer: ${t.layer}`);
    if (t.current_agent) subBits.push(`agent: ${t.current_agent}`);
    items.push({
      id: `ticket:${t.id}`,
      kind: 'ticket',
      title: t.title,
      subtitle: subBits.join(' · '),
      timestamp: t.updated_at,
      ticketId: t.id,
      href: `${linkPrefix}/tickets/${t.id}`,
    });
  }

  for (const b of (briefsRes.data ?? []) as Array<{
    id: string;
    source: string;
    word_count: number;
    raw_text: string | null;
    created_at: string;
  }>) {
    items.push({
      id: `brief:${b.id}`,
      kind: 'brief',
      title: `Brief submitted (${b.source})`,
      subtitle: previewText(b.raw_text) || `${b.word_count} words`,
      timestamp: b.created_at,
      ticketId: null,
      href: null,
      meta: `${b.word_count} words`,
    });
  }

  for (const r of (runsRes.data ?? []) as Array<{
    id: string;
    ticket_id: string;
    run_kind: string;
    agent_id: string | null;
    model: string | null;
    status: string;
    started_at: string;
  }>) {
    const sub: string[] = [`status: ${r.status}`];
    if (r.agent_id) sub.push(r.agent_id);
    if (r.model) sub.push(r.model);
    items.push({
      id: `run:${r.id}`,
      kind: 'run',
      title: `${r.run_kind} run — ${titleMap.get(r.ticket_id) ?? r.ticket_id.slice(0, 8)}`,
      subtitle: sub.join(' · '),
      timestamp: r.started_at,
      ticketId: r.ticket_id,
      href: `${linkPrefix}/tickets/${r.ticket_id}`,
    });
  }

  for (const e of (traceRes.data ?? []) as Array<{
    id: number;
    ticket_id: string;
    seq: number;
    event_type: string;
    from_agent: string | null;
    to_agent: string | null;
    created_at: string;
  }>) {
    items.push({
      id: `trace:${e.id}`,
      kind: 'trace',
      title: `${e.event_type} (#${e.seq})`,
      subtitle: `${e.from_agent ?? '—'} → ${e.to_agent ?? '—'} · ${titleMap.get(e.ticket_id) ?? e.ticket_id.slice(0, 8)}`,
      timestamp: e.created_at,
      ticketId: e.ticket_id,
      href: `${linkPrefix}/tickets/${e.ticket_id}`,
    });
  }

  for (const p of (packetsRes.data ?? []) as Array<{
    id: string;
    ticket_id: string;
    packet_type: string;
    body_parsed: Record<string, unknown> | null;
    created_at: string;
  }>) {
    const kindLabel =
      typeof p.body_parsed?.packet_kind === 'string'
        ? (p.body_parsed.packet_kind as string)
        : null;
    items.push({
      id: `packet:${p.id}`,
      kind: 'packet',
      title: `${p.packet_type} packet${kindLabel ? ` · ${kindLabel}` : ''}`,
      subtitle: titleMap.get(p.ticket_id) ?? p.ticket_id.slice(0, 8),
      timestamp: p.created_at,
      ticketId: p.ticket_id,
      href: `${linkPrefix}/tickets/${p.ticket_id}`,
    });
  }

  for (const a of (artifactsRes.data ?? []) as Array<{
    id: string;
    ticket_id: string | null;
    kind: string;
    mime_type: string | null;
    bytes: number | null;
    created_at: string;
  }>) {
    const sub: string[] = [];
    if (a.mime_type) sub.push(a.mime_type);
    if (a.bytes != null) sub.push(`${a.bytes.toLocaleString()} bytes`);
    if (a.ticket_id) sub.push(titleMap.get(a.ticket_id) ?? a.ticket_id.slice(0, 8));
    items.push({
      id: `artifact:${a.id}`,
      kind: 'artifact',
      title: `${a.kind} artifact`,
      subtitle: sub.join(' · '),
      timestamp: a.created_at,
      ticketId: a.ticket_id,
      href: a.ticket_id ? `${linkPrefix}/tickets/${a.ticket_id}` : null,
    });
  }

  const kindFilterToItem: Record<KindFilter, ItemKind | null> = {
    all: null,
    tickets: 'ticket',
    briefs: 'brief',
    runs: 'run',
    trace: 'trace',
    packets: 'packet',
    artifacts: 'artifact',
  };
  const targetKind = kindFilterToItem[filter];
  const filtered = targetKind ? items.filter((i) => i.kind === targetKind) : items;

  filtered.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  const visible = filtered.slice(0, TOTAL_CAP);

  const counts: Record<KindFilter, number> = {
    all: items.length,
    tickets: items.filter((i) => i.kind === 'ticket').length,
    briefs: items.filter((i) => i.kind === 'brief').length,
    runs: items.filter((i) => i.kind === 'run').length,
    trace: items.filter((i) => i.kind === 'trace').length,
    packets: items.filter((i) => i.kind === 'packet').length,
    artifacts: items.filter((i) => i.kind === 'artifact').length,
  };

  const latest = visible[0]?.timestamp ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          <Link href={`/w/${workspace.slug}`} className="hover:text-neutral-300">
            {workspace.name}
          </Link>
          {' · '}History
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">History</h1>
        <p className="text-sm text-neutral-400">
          Recent workspace activity across briefs, tickets, runs, and evidence. Read-only.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Shown</p>
          <p className="mt-0.5 text-sm font-medium text-neutral-100">{visible.length}</p>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Latest activity</p>
          <p className="mt-0.5 text-sm font-medium text-neutral-100">
            {latest ? fmtTime(latest) : '—'}
          </p>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Per-source cap</p>
          <p className="mt-0.5 text-sm font-medium text-neutral-100">{LIMIT_PER_SOURCE}</p>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Sources</p>
          <p className="mt-0.5 text-sm font-medium text-neutral-100">
            tickets · briefs · runs · trace · packets · artifacts
          </p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2">
        {KINDS.map((key) => {
          const active = key === filter;
          const href = key === 'all' ? `${linkPrefix}/history` : `${linkPrefix}/history?kind=${key}`;
          const base = 'rounded border px-2.5 py-1 text-xs font-medium transition-colors';
          const tone = active
            ? 'border-neutral-100 bg-neutral-100 text-neutral-900'
            : 'border-neutral-800 text-neutral-300 hover:border-neutral-600';
          return (
            <Link key={key} href={href} className={`${base} ${tone}`}>
              {KIND_LABEL[key]}
              <span
                className={`ml-1.5 text-[10px] ${
                  active ? 'text-neutral-600' : 'text-neutral-500'
                }`}
              >
                {counts[key]}
              </span>
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <div className="rounded border border-dashed border-neutral-800 bg-neutral-950 p-6 text-sm text-neutral-400">
          <p>
            No activity yet. Submit a brief from{' '}
            <Link
              href={`/w/${workspace.slug}/new/paste`}
              className="text-neutral-200 underline-offset-2 hover:underline"
            >
              Paste
            </Link>{' '}
            or{' '}
            <Link
              href={`/w/${workspace.slug}/new/upload`}
              className="text-neutral-200 underline-offset-2 hover:underline"
            >
              Upload
            </Link>{' '}
            to start the loop.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {visible.map((item) => {
            const tone = KIND_TONE[item.kind];
            const inner = (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono font-medium uppercase tracking-wider ${tone}`}
                  >
                    {item.kind}
                  </span>
                  <span className="truncate text-xs text-neutral-100">{item.title}</span>
                  <span className="ml-auto text-neutral-500">{fmtTime(item.timestamp)}</span>
                </div>
                {item.subtitle ? (
                  <p className="mt-1 truncate text-[11px] text-neutral-400">{item.subtitle}</p>
                ) : null}
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="block rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2 hover:border-neutral-700 hover:bg-neutral-900"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2">
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-[11px] text-neutral-600">
        Each source capped at {LIMIT_PER_SOURCE} recent rows; merged timeline capped at {TOTAL_CAP}.
        RLS-gated session reads only — no service-role bypass.
      </p>
    </div>
  );
}
