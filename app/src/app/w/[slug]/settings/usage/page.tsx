import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const RUN_KINDS = ['orchestrator', 'coordinator', 'specialist', 'qa', 'truth'] as const;
type RunKind = (typeof RUN_KINDS)[number];

const RUN_LIMIT = 100;

const STATUS_TONE: Record<string, string> = {
  done: 'bg-emerald-950 text-emerald-200',
  running: 'bg-sky-950 text-sky-200',
  pending: 'bg-neutral-800 text-neutral-200',
  failed: 'bg-rose-950 text-rose-200',
};

const KIND_TONE: Record<RunKind, string> = {
  orchestrator: 'bg-violet-950 text-violet-200',
  coordinator: 'bg-sky-950 text-sky-200',
  specialist: 'bg-fuchsia-950 text-fuchsia-200',
  qa: 'bg-amber-950 text-amber-200',
  truth: 'bg-emerald-950 text-emerald-200',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

function fmtNumber(n: number): string {
  return n.toLocaleString();
}

type RunRow = {
  id: string;
  ticket_id: string;
  run_kind: RunKind;
  agent_id: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  status: string;
  started_at: string;
  ended_at: string | null;
};

export default async function UsagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  const { data: runsData } = await supabase
    .from('workflow_runs')
    .select(
      'id, ticket_id, run_kind, agent_id, model, input_tokens, output_tokens, cost_usd, status, started_at, ended_at',
    )
    .eq('workspace_id', workspace.id)
    .order('started_at', { ascending: false })
    .limit(RUN_LIMIT);

  const runs = ((runsData ?? []) as RunRow[]).map((r) => ({
    ...r,
    input_tokens: Number(r.input_tokens ?? 0),
    output_tokens: Number(r.output_tokens ?? 0),
    cost_usd: Number(r.cost_usd ?? 0),
  }));

  const ticketIds = Array.from(new Set(runs.map((r) => r.ticket_id)));
  const titleMap = new Map<string, string>();
  if (ticketIds.length > 0) {
    const { data: ticketRows } = await supabase
      .from('tickets')
      .select('id, title')
      .in('id', ticketIds);
    for (const row of (ticketRows ?? []) as Array<{ id: string; title: string }>) {
      titleMap.set(row.id, row.title);
    }
  }

  const totalRuns = runs.length;
  const totalInputTokens = runs.reduce((acc, r) => acc + r.input_tokens, 0);
  const totalOutputTokens = runs.reduce((acc, r) => acc + r.output_tokens, 0);
  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalCost = runs.reduce((acc, r) => acc + r.cost_usd, 0);
  const latest = runs[0]?.started_at ?? null;

  const byKind: Record<RunKind, { runs: number; tokens: number; cost: number }> = {
    orchestrator: { runs: 0, tokens: 0, cost: 0 },
    coordinator: { runs: 0, tokens: 0, cost: 0 },
    specialist: { runs: 0, tokens: 0, cost: 0 },
    qa: { runs: 0, tokens: 0, cost: 0 },
    truth: { runs: 0, tokens: 0, cost: 0 },
  };
  for (const r of runs) {
    const slot = byKind[r.run_kind];
    if (!slot) continue;
    slot.runs += 1;
    slot.tokens += r.input_tokens + r.output_tokens;
    slot.cost += r.cost_usd;
  }

  const linkPrefix = `/w/${workspace.slug}`;

  const summaryCards = [
    { label: 'Total runs', value: fmtNumber(totalRuns) },
    { label: 'Total tokens', value: fmtNumber(totalTokens) },
    { label: 'Total cost', value: fmtCost(totalCost) },
    { label: 'Latest run', value: latest ? fmtTime(latest) : '—' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          <Link href={linkPrefix} className="hover:text-neutral-300">
            {workspace.name}
          </Link>
          {' · '}
          <Link href={`${linkPrefix}/settings`} className="hover:text-neutral-300">
            Settings
          </Link>
          {' · '}Usage
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Usage</h1>
        <p className="text-sm text-neutral-400">
          Approximate workflow usage from recorded runs. Not billing-grade.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {summaryCards.map((c) => (
          <div
            key={c.label}
            className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2"
          >
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">{c.label}</p>
            <p className="mt-0.5 truncate text-sm font-medium text-neutral-100">{c.value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-200">Runs by kind</h2>
        <div className="overflow-hidden rounded border border-neutral-800">
          <table className="w-full text-xs">
            <thead className="bg-neutral-900/60 text-neutral-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kind</th>
                <th className="px-3 py-2 text-right font-medium">Runs</th>
                <th className="px-3 py-2 text-right font-medium">Tokens</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 text-neutral-200">
              {RUN_KINDS.map((kind) => {
                const slot = byKind[kind];
                return (
                  <tr key={kind} className="bg-neutral-950">
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${KIND_TONE[kind]}`}
                      >
                        {kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(slot.runs)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(slot.tokens)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCost(slot.cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-200">
          Recent runs <span className="text-neutral-500">(latest {RUN_LIMIT})</span>
        </h2>
        {runs.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-800 bg-neutral-950 p-6 text-sm text-neutral-400">
            No recorded runs yet. Submit a brief to start the loop.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-neutral-800">
            <table className="w-full text-xs">
              <thead className="bg-neutral-900/60 text-neutral-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Time</th>
                  <th className="px-3 py-2 text-left font-medium">Kind</th>
                  <th className="px-3 py-2 text-left font-medium">Agent</th>
                  <th className="px-3 py-2 text-left font-medium">Model</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">In</th>
                  <th className="px-3 py-2 text-right font-medium">Out</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-left font-medium">Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 text-neutral-200">
                {runs.map((r) => {
                  const statusTone = STATUS_TONE[r.status] ?? 'bg-neutral-800 text-neutral-200';
                  const ticketTitle = titleMap.get(r.ticket_id) ?? r.ticket_id.slice(0, 8);
                  return (
                    <tr key={r.id} className="bg-neutral-950">
                      <td className="whitespace-nowrap px-3 py-2 text-neutral-400">
                        {fmtTime(r.started_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${
                            KIND_TONE[r.run_kind] ?? 'bg-neutral-800 text-neutral-200'
                          }`}
                        >
                          {r.run_kind}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-neutral-300">{r.agent_id ?? '—'}</td>
                      <td className="px-3 py-2 text-neutral-300">{r.model ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${statusTone}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtNumber(r.input_tokens)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtNumber(r.output_tokens)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtCost(r.cost_usd)}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`${linkPrefix}/tickets/${r.ticket_id}`}
                          className="truncate text-neutral-200 underline-offset-2 hover:underline"
                        >
                          {ticketTitle}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-neutral-600">
        Operational visibility only — not billing, not a budget enforcement. Capped at latest{' '}
        {RUN_LIMIT} runs. RLS-gated session reads only — no service-role bypass.
      </p>
    </div>
  );
}
