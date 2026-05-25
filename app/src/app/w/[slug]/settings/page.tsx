import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function SettingsLandingPage({
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
    .select('id, name, slug, plan, created_at')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  const [memberCountRes, inviteCountRes, ownMemberRes] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id),
    supabase
      .from('workspace_invites')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id),
    supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace.id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const memberCount = memberCountRes.count ?? 0;
  const inviteCount = inviteCountRes.count ?? null; // null when RLS blocks (non-admin)
  const ownRole = (ownMemberRes.data?.role ?? null) as string | null;
  const canSeeInvites = inviteCount !== null;

  const metaCells = [
    { label: 'Name', value: workspace.name },
    { label: 'Slug', value: workspace.slug },
    { label: 'Plan', value: workspace.plan ?? '—' },
    { label: 'Created', value: workspace.created_at ? fmtDate(workspace.created_at) : '—' },
    { label: 'Members', value: String(memberCount) },
    { label: 'Your role', value: ownRole ?? '—' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          <Link href={`/w/${workspace.slug}`} className="hover:text-neutral-300">
            {workspace.name}
          </Link>
          {' · '}Settings
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Settings</h1>
        <p className="text-sm text-neutral-400">
          Workspace configuration. Read-only for everything except member invites.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {metaCells.map((c) => (
          <div
            key={c.label}
            className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2"
          >
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">{c.label}</p>
            <p className="mt-0.5 truncate text-sm font-medium text-neutral-100">{c.value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-200">Areas</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          <li>
            <Link
              href={`/w/${workspace.slug}/settings/members`}
              className="block rounded border border-neutral-800 bg-neutral-950 p-4 hover:border-neutral-600"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-100">Members</p>
                <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200">
                  Live
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {memberCount} member{memberCount === 1 ? '' : 's'}
                {canSeeInvites ? ` · ${inviteCount} invite${inviteCount === 1 ? '' : 's'}` : ''}
              </p>
              <p className="mt-1 text-[11px] text-neutral-500">
                Invite teammates and review pending invites.
              </p>
            </Link>
          </li>
          <li>
            <div
              aria-disabled="true"
              className="block rounded border border-neutral-800 bg-neutral-950 p-4 opacity-70"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-200">Workspace profile</p>
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                  Read-only
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Name and slug. Editing not wired yet.
              </p>
            </div>
          </li>
          <li>
            <div
              aria-disabled="true"
              className="block rounded border border-neutral-800 bg-neutral-950 p-4 opacity-70"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-200">Billing</p>
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                  Phase 4
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Plan: {workspace.plan ?? '—'}. No billing meter or budget yet.
              </p>
            </div>
          </li>
          <li>
            <div
              aria-disabled="true"
              className="block rounded border border-neutral-800 bg-neutral-950 p-4 opacity-70"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-200">Connectors</p>
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                  Phase 5
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Drive, Slack, and friends. No OAuth wired yet.
              </p>
            </div>
          </li>
        </ul>
      </section>

      <p className="text-[11px] text-neutral-600">
        RLS-gated session reads only — no service-role bypass.
      </p>
    </div>
  );
}
