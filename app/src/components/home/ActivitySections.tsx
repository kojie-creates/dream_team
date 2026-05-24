import Link from 'next/link';
import { EmptyPanel } from './EmptyPanel';
import { StatusPill } from '@/components/tickets/StatusPill';

export type BriefRow = {
  id: string;
  source: string;
  word_count: number;
  raw_text: string | null;
  created_at: string;
};

export type TicketRow = {
  id: string;
  title: string;
  status: string;
  layer: string | null;
  current_agent: string | null;
  updated_at: string;
};

export type WorkflowRunRow = {
  id: string;
  ticket_id: string;
  ticket_title: string | null;
  run_kind: string;
  agent_id: string | null;
  model: string | null;
  status: string;
  started_at: string;
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function previewText(raw: string | null, max = 120): string {
  if (!raw) return '';
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) + '…' : flat;
}

function RecentBriefsPanel({ briefs }: { briefs: BriefRow[] }) {
  if (briefs.length === 0) {
    return (
      <EmptyPanel
        title="Recent briefs"
        hint="Briefs you submit show up here, newest first."
      />
    );
  }
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <h3 className="text-sm font-medium text-neutral-200">Recent briefs</h3>
      <ul className="mt-3 space-y-3">
        {briefs.map((b) => (
          <li key={b.id} className="space-y-1 border-b border-neutral-800/60 pb-2 last:border-0 last:pb-0">
            <div className="flex items-center gap-2 text-[11px] text-neutral-500">
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-300">{b.source}</span>
              <span>{b.word_count} words</span>
              <span className="ml-auto">{fmtDate(b.created_at)}</span>
            </div>
            <p className="text-xs leading-relaxed text-neutral-400">{previewText(b.raw_text)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentTicketsPanel({ slug, tickets }: { slug: string; tickets: TicketRow[] }) {
  if (tickets.length === 0) {
    return (
      <EmptyPanel
        title="Tickets"
        hint="Every brief becomes a ticket the Orchestrator routes. Open tickets live here with their current agent."
      />
    );
  }
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-neutral-200">Tickets</h3>
        <Link href={`/w/${slug}/tickets`} className="text-[11px] text-neutral-500 hover:text-neutral-300">
          View all →
        </Link>
      </header>
      <ul className="mt-3 space-y-2">
        {tickets.map((t) => (
          <li key={t.id}>
            <Link
              href={`/w/${slug}/tickets/${t.id}`}
              className="block rounded border border-transparent px-2 py-1.5 hover:border-neutral-800 hover:bg-neutral-900"
            >
              <div className="flex items-center gap-2">
                <StatusPill status={t.status} size="xs" />
                <span className="truncate text-xs text-neutral-200">{t.title}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                {t.layer ? <span>layer: {t.layer}</span> : null}
                {t.current_agent ? <span>agent: {t.current_agent}</span> : null}
                <span className="ml-auto">{fmtDate(t.updated_at)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentRunsPanel({ slug, runs }: { slug: string; runs: WorkflowRunRow[] }) {
  if (runs.length === 0) {
    return (
      <EmptyPanel
        title="Workflow runs"
        hint="When a coordinator hands off to specialists, each step lands in this log with timing and verdict."
      />
    );
  }
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <h3 className="text-sm font-medium text-neutral-200">Workflow runs</h3>
      <ul className="mt-3 space-y-2">
        {runs.map((r) => (
          <li key={r.id}>
            <Link
              href={`/w/${slug}/tickets/${r.ticket_id}`}
              className="block rounded border border-transparent px-2 py-1.5 hover:border-neutral-800 hover:bg-neutral-900"
            >
              <div className="flex items-center gap-2">
                <StatusPill status={r.status} size="xs" />
                <span className="truncate text-xs text-neutral-200">
                  {r.ticket_title ?? r.ticket_id.slice(0, 8)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                <span className="font-mono">{r.run_kind}</span>
                {r.agent_id ? <span>{r.agent_id}</span> : null}
                {r.model ? <span>· {r.model}</span> : null}
                <span className="ml-auto">{fmtDate(r.started_at)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Summary = {
  openTickets: number;
  doneTickets: number;
  totalBriefs: number;
  latestRunStatus: string | null;
};

function HomeSummaryStrip({ summary }: { summary: Summary }) {
  const cells = [
    { label: 'Open tickets', value: String(summary.openTickets) },
    { label: 'Done tickets', value: String(summary.doneTickets) },
    { label: 'Total briefs', value: String(summary.totalBriefs) },
    { label: 'Latest run', value: summary.latestRunStatus ?? '—' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">{c.label}</p>
          <p className="mt-0.5 text-sm font-medium text-neutral-100">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

export function ActivitySections({
  slug,
  briefs,
  tickets,
  workflowRuns,
  summary,
}: {
  slug: string;
  briefs: BriefRow[];
  tickets: TicketRow[];
  workflowRuns: WorkflowRunRow[];
  summary: Summary;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-neutral-200">Activity</h2>
      <HomeSummaryStrip summary={summary} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <RecentBriefsPanel briefs={briefs} />
        <RecentTicketsPanel slug={slug} tickets={tickets} />
        <RecentRunsPanel slug={slug} runs={workflowRuns} />
      </div>
    </section>
  );
}
