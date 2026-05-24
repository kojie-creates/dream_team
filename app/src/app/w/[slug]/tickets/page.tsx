import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StatusPill } from '@/components/tickets/StatusPill';

const STATUSES = ['open', 'in_progress', 'needs_input', 'done', 'failed', 'looped'] as const;
type StatusFilter = (typeof STATUSES)[number] | 'all';

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'All',
  open: 'Open',
  in_progress: 'In progress',
  needs_input: 'Needs input',
  done: 'Done',
  failed: 'Failed',
  looped: 'Looped',
};

function parseStatus(input: string | string[] | undefined): StatusFilter {
  if (typeof input !== 'string') return 'all';
  return (STATUSES as readonly string[]).includes(input) ? (input as StatusFilter) : 'all';
}

type TicketRow = {
  id: string;
  title: string;
  status: string;
  layer: string | null;
  current_agent: string | null;
  updated_at: string;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default async function TicketListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { slug } = await params;
  const { status: rawStatus } = await searchParams;
  const filter = parseStatus(rawStatus);

  const supabase = await createSupabaseServerClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  const rowsQuery =
    filter === 'all'
      ? supabase
          .from('tickets')
          .select('id, title, status, layer, current_agent, updated_at')
          .eq('workspace_id', workspace.id)
          .order('updated_at', { ascending: false })
          .limit(50)
      : supabase
          .from('tickets')
          .select('id, title, status, layer, current_agent, updated_at')
          .eq('workspace_id', workspace.id)
          .eq('status', filter)
          .order('updated_at', { ascending: false })
          .limit(50);

  const countQueries = [
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id),
    ...STATUSES.map((s) =>
      supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace.id)
        .eq('status', s),
    ),
  ];

  const [rowsRes, ...countResults] = await Promise.all([rowsQuery, ...countQueries]);
  const rows: TicketRow[] = (rowsRes.data ?? []) as TicketRow[];

  const counts: Record<StatusFilter, number> = {
    all: countResults[0]?.count ?? 0,
    open: countResults[1]?.count ?? 0,
    in_progress: countResults[2]?.count ?? 0,
    needs_input: countResults[3]?.count ?? 0,
    done: countResults[4]?.count ?? 0,
    failed: countResults[5]?.count ?? 0,
    looped: countResults[6]?.count ?? 0,
  };

  const chipKeys: StatusFilter[] = ['all', ...STATUSES];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          <Link href={`/w/${workspace.slug}`} className="hover:text-neutral-300">
            {workspace.name}
          </Link>
          {' · '}Tickets
        </p>
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Tickets</h1>
          <span className="text-xs text-neutral-500">{rows.length} shown</span>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {chipKeys.map((key) => {
          const active = key === filter;
          const href = key === 'all' ? `/w/${workspace.slug}/tickets` : `/w/${workspace.slug}/tickets?status=${key}`;
          const base =
            'rounded border px-2.5 py-1 text-xs font-medium transition-colors';
          const tone = active
            ? 'border-neutral-100 bg-neutral-100 text-neutral-900'
            : 'border-neutral-800 text-neutral-300 hover:border-neutral-600';
          return (
            <Link key={key} href={href} className={`${base} ${tone}`}>
              {STATUS_LABEL[key]}
              <span className={`ml-1.5 text-[10px] ${active ? 'text-neutral-600' : 'text-neutral-500'}`}>
                {counts[key]}
              </span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-800 bg-neutral-950 p-6 text-xs text-neutral-500">
          {filter === 'all'
            ? 'No tickets yet. Paste a brief from the workspace home to create one.'
            : `No tickets with status “${STATUS_LABEL[filter]}” yet.`}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/w/${workspace.slug}/tickets/${t.id}`}
                className="block rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2 hover:border-neutral-700 hover:bg-neutral-900"
              >
                <div className="flex items-center gap-2">
                  <StatusPill status={t.status} size="xs" />
                  <span className="truncate text-sm text-neutral-100">{t.title}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                  {t.layer ? <span>layer: {t.layer}</span> : null}
                  {t.current_agent ? <span>agent: {t.current_agent}</span> : null}
                  <span className="ml-auto">updated {fmtDate(t.updated_at)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rows.length === 50 ? (
        <p className="text-[11px] text-neutral-600">
          Showing 50 most recent. Older tickets will appear once pagination ships.
        </p>
      ) : null}
    </div>
  );
}
