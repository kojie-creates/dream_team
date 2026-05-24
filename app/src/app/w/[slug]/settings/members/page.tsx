import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InviteForm } from '@/components/invites/InviteForm';

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

  // RLS gates this to admin/owner via workspace_invites_admin_select.
  const { data: invites } = await supabase
    .from('workspace_invites')
    .select('id, email, role, expires_at, accepted_at, created_at')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false });

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-neutral-100">Members</h1>
        <p className="text-xs text-neutral-500">Invite teammates by email. Each link is single-use and expires after 7 days.</p>
      </header>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-200">Send an invite</h2>
        <InviteForm slug={workspace.slug} />
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-200">Pending + recent invites</h2>
        {!invites || invites.length === 0 ? (
          <p className="text-xs text-neutral-500">No invites yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {invites.map((inv) => {
              const expired = new Date(inv.expires_at) < new Date();
              const status = inv.accepted_at
                ? 'accepted'
                : expired
                  ? 'expired'
                  : 'pending';
              return (
                <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="text-neutral-100">{inv.email}</span>
                    <span className="text-xs text-neutral-500">role: {inv.role}</span>
                  </div>
                  <span
                    className={[
                      'rounded px-2 py-0.5 text-xs',
                      status === 'accepted'
                        ? 'bg-emerald-900/40 text-emerald-300'
                        : status === 'expired'
                          ? 'bg-neutral-800 text-neutral-400'
                          : 'bg-amber-900/40 text-amber-300',
                    ].join(' ')}
                  >
                    {status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
