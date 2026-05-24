import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { HomeIntro } from '@/components/home/HomeIntro';
import { StarterDomains } from '@/components/home/StarterDomains';
import {
  ActivitySections,
  type BriefRow,
  type TicketRow,
  type WorkflowRunRow,
  type Summary,
} from '@/components/home/ActivitySections';
import { ConnectorsPanel } from '@/components/home/ConnectorsPanel';

export default async function WorkspaceHomePage({
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

  const [briefsRes, ticketsRes, runsRes, openCountRes, doneCountRes, briefsCountRes] = await Promise.all([
    supabase
      .from('briefs')
      .select('id, source, word_count, raw_text, created_at')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('tickets')
      .select('id, title, status, layer, current_agent, updated_at')
      .eq('workspace_id', workspace.id)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('workflow_runs')
      .select('id, ticket_id, run_kind, agent_id, model, status, started_at')
      .eq('workspace_id', workspace.id)
      .order('started_at', { ascending: false })
      .limit(5),
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id)
      .eq('status', 'open'),
    supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id)
      .eq('status', 'done'),
    supabase
      .from('briefs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id),
  ]);

  const briefs: BriefRow[] = (briefsRes.data ?? []) as BriefRow[];
  const tickets: TicketRow[] = (ticketsRes.data ?? []) as TicketRow[];
  const runsRaw = (runsRes.data ?? []) as Array<{
    id: string;
    ticket_id: string;
    run_kind: string;
    agent_id: string | null;
    model: string | null;
    status: string;
    started_at: string;
  }>;

  let workflowRuns: WorkflowRunRow[] = runsRaw.map((r) => ({ ...r, ticket_title: null }));
  if (runsRaw.length > 0) {
    const ticketIds = Array.from(new Set(runsRaw.map((r) => r.ticket_id)));
    const { data: titleRows } = await supabase
      .from('tickets')
      .select('id, title')
      .in('id', ticketIds);
    const titleMap = new Map<string, string>(
      (titleRows ?? []).map((t) => [t.id as string, t.title as string]),
    );
    workflowRuns = runsRaw.map((r) => ({ ...r, ticket_title: titleMap.get(r.ticket_id) ?? null }));
  }

  const summary: Summary = {
    openTickets: openCountRes.count ?? 0,
    doneTickets: doneCountRes.count ?? 0,
    totalBriefs: briefsCountRes.count ?? 0,
    latestRunStatus: workflowRuns[0]?.status ?? null,
  };

  return (
    <div className="space-y-10">
      <HomeIntro workspaceName={workspace.name} slug={workspace.slug} />
      <StarterDomains />
      <ActivitySections
        slug={workspace.slug}
        briefs={briefs}
        tickets={tickets}
        workflowRuns={workflowRuns}
        summary={summary}
      />
      <ConnectorsPanel />
    </div>
  );
}
