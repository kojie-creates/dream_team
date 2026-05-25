// Phase 5 T5 — Automation rules settings page.
// Manual runs only. No scheduler, no cron, no background execution.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreateAutomationRuleForm } from '@/components/automations/CreateAutomationRuleForm';
import { RunAutomationRuleForm } from '@/components/automations/RunAutomationRuleForm';

type RuleRow = {
  id: string;
  name: string;
  status: string;
  trigger_type: string;
  config: Record<string, unknown> | null;
  last_run_at: string | null;
  last_result: string | null;
  created_at: string;
};

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default async function AutomationsSettingsPage({
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
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  const { data: gcalConnector } = await supabase
    .from('connectors')
    .select('id, status')
    .eq('workspace_id', workspace.id)
    .eq('provider', 'google_calendar')
    .maybeSingle();
  const isConnected = !!gcalConnector && gcalConnector.status === 'connected';

  const { data: rulesRaw } = await supabase
    .from('automation_rules')
    .select('id, name, status, trigger_type, config, last_run_at, last_result, created_at')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false });
  const rules = (rulesRaw ?? []) as RuleRow[];

  const createDisabledReason = !isConnected
    ? 'Connect Google Calendar before creating a rule.'
    : undefined;

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          <Link href={`/w/${workspace.slug}`} className="hover:text-neutral-300">
            {workspace.name}
          </Link>
          {' · '}
          <Link href={`/w/${workspace.slug}/settings`} className="hover:text-neutral-300">
            Settings
          </Link>
          {' · '}Automations
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Automations</h1>
        <p className="text-sm text-neutral-400">
          User-defined rules for connector ingest. Phase 5 T5.
        </p>
      </header>

      <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-amber-100/90">
        <p className="font-medium uppercase tracking-wider text-amber-300/80">Manual runs first</p>
        <p className="mt-1">
          Manual runs first. Scheduled background execution is not enabled yet. Each rule only
          runs when you click <span className="font-medium">Run now</span>. Reloading this page
          does not run anything.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium text-neutral-200">
          New rule — Google Calendar ingest
        </h2>
        <p className="text-xs text-neutral-500">
          Creates a brief and ticket from the next matching event when you run it. Owner or admin
          only.
        </p>
        <CreateAutomationRuleForm
          slug={workspace.slug}
          disabled={!isConnected}
          disabledReason={createDisabledReason}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-400">Rules</h2>
        {rules.length === 0 ? (
          <p className="rounded border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-500">
            No automation rules yet.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900/40">
            {rules.map((r) => {
              const cfg = (r.config ?? {}) as { match_text?: string; window_days?: number };
              const windowDays = cfg.window_days ?? 7;
              const match = cfg.match_text?.trim();
              const isCalendar = r.trigger_type === 'manual_calendar_ingest';
              return (
                <li key={r.id} className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-neutral-100">{r.name}</p>
                      <p className="text-[11px] text-neutral-500">
                        {r.trigger_type} · status: {r.status} · window: next {windowDays}d
                        {match ? ` · match: "${match}"` : ' · match: any'}
                      </p>
                      <p className="text-[11px] text-neutral-600">
                        Last run: {fmtWhen(r.last_run_at)}
                        {r.last_result ? ` — ${r.last_result}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {isCalendar && isConnected ? (
                        <RunAutomationRuleForm slug={workspace.slug} ruleId={r.id} />
                      ) : (
                        <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-400">
                          {isCalendar ? 'Not connected' : 'Later'}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="rounded border border-neutral-800 bg-neutral-950 p-3 text-[11px] text-neutral-500">
        <p className="font-medium text-neutral-400">Scheduling</p>
        <p className="mt-1">
          A daily digest trigger type is reserved for a later ticket and is not executable here.
          No cron, queue worker, or background job runs against these rules in T5.
        </p>
      </div>
    </section>
  );
}
