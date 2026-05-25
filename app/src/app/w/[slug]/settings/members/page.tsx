import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InviteForm } from '@/components/invites/InviteForm';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const ROLE_TONE: Record<string, string> = {
  owner: 'bg-violet-950 text-violet-200',
  admin: 'bg-sky-950 text-sky-200',
  member: 'bg-neutral-800 text-neutral-200',
};

function RoleBadge({ role }: { role: string }) {
  const tone = ROLE_TONE[role] ?? 'bg-neutral-800 text-neutral-200';
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${tone}`}
    >
      {role}
    </span>
  );
}

const STATUS_TONE: Record<'pending' | 'accepted' | 'expired', string> = {
  pending: 'bg-amber-900/40 text-amber-300',
  accepted: 'bg-emerald-900/40 text-emerald-300',
  expired: 'bg-neutral-800 text-neutral-400',
};

export default async function MembersSettingsPage({
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

  type MemberRow = {
    user_id: string;
    role: string;
    joined_at: string;
    invited_by: string | null;
  };
  const { data: membersData } = await supabase
    .from('workspace_members')
    .select('user_id, role, joined_at, invited_by')
    .eq('workspace_id', workspace.id)
    .order('joined_at', { ascending: true });
  const members: MemberRow[] = (membersData ?? []) as MemberRow[];

  // users_profile RLS only exposes the caller's own row, so display_name is
  // only resolvable for self. Other members render as truncated UUIDs.
  const { data: selfProfile } = await supabase
    .from('users_profile')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  const selfName = (selfProfile?.display_name as string | null) ?? null;

  // RLS gates this to admin/owner via workspace_invites_admin_select.
  const { data: invitesData } = await supabase
    .from('workspace_invites')
    .select('id, email, role, expires_at, accepted_at, created_at')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false });
  type InviteRow = {
    id: string;
    email: string;
    role: string;
    expires_at: string;
    accepted_at: string | null;
    created_at: string;
  };
  const invites: InviteRow[] = (invitesData ?? []) as InviteRow[];
  const canSeeInvites = invitesData !== null; // RLS denial returns []/error; treat empty as either

  const now = new Date();
  const invitesWithStatus = invites.map((inv) => {
    const expired = new Date(inv.expires_at) < now;
    const status: 'pending' | 'accepted' | 'expired' = inv.accepted_at
      ? 'accepted'
      : expired
        ? 'expired'
        : 'pending';
    return { ...inv, status };
  });

  const counts = {
    pending: invitesWithStatus.filter((i) => i.status === 'pending').length,
    accepted: invitesWithStatus.filter((i) => i.status === 'accepted').length,
    expired: invitesWithStatus.filter((i) => i.status === 'expired').length,
  };

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          <Link href={`/w/${workspace.slug}`} className="hover:text-neutral-300">
            {workspace.name}
          </Link>
          {' · '}
          <Link href={`/w/${workspace.slug}/settings`} className="hover:text-neutral-300">
            Settings
          </Link>
          {' · '}Members
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Members</h1>
        <p className="text-sm text-neutral-400">
          {members.length} member{members.length === 1 ? '' : 's'} in this workspace.
        </p>
      </header>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-200">Current members</h2>
        {members.length === 0 ? (
          <p className="text-xs text-neutral-500">No members visible to you.</p>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {members.map((m) => {
              const isSelf = m.user_id === user.id;
              const label = isSelf
                ? selfName
                  ? `${selfName} (you)`
                  : `${user.email ?? user.id.slice(0, 8)} (you)`
                : `user ${m.user_id.slice(0, 8)}…`;
              return (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <RoleBadge role={m.role} />
                    <span className="truncate text-neutral-100">{label}</span>
                  </div>
                  <span className="text-[11px] text-neutral-500">
                    joined {fmtDate(m.joined_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-neutral-600">
          Other members&apos; display names are hidden by RLS (`users_profile` is self-only). User
          IDs are truncated.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="mb-1 text-sm font-medium text-neutral-200">Send an invite</h2>
        <p className="mb-3 text-[11px] text-neutral-500">
          Each link is single-use and expires after 7 days. No production email provider is
          configured: the invite URL is logged to the server console and shown inline below the
          form so you can copy and share it manually.
        </p>
        <InviteForm slug={workspace.slug} />
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-neutral-200">Pending + recent invites</h2>
          {canSeeInvites ? (
            <span className="text-[11px] text-neutral-500">
              pending {counts.pending} · accepted {counts.accepted} · expired {counts.expired}
            </span>
          ) : null}
        </div>
        {!canSeeInvites ? (
          <p className="text-xs text-neutral-500">
            Invites are visible to owners and admins only.
          </p>
        ) : invitesWithStatus.length === 0 ? (
          <p className="text-xs text-neutral-500">No invites yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {invitesWithStatus.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-neutral-100">{inv.email}</span>
                  <span className="text-[11px] text-neutral-500">
                    <RoleBadge role={inv.role} />
                    <span className="ml-2">
                      sent {fmtDate(inv.created_at)} · expires {fmtDate(inv.expires_at)}
                    </span>
                  </span>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[inv.status]}`}
                >
                  {inv.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-neutral-600">
        RLS-gated session reads only — no service-role bypass.
      </p>
    </section>
  );
}
