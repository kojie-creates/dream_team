import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-neutral-500">{workspace.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Settings</h1>
        <p className="text-sm text-neutral-400">
          Workspace configuration. More controls land in later Phase 3 tickets.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <Link
            href={`/w/${workspace.slug}/settings/members`}
            className="block rounded border border-neutral-800 bg-neutral-950 p-4 hover:border-neutral-600"
          >
            <p className="text-sm font-medium text-neutral-100">Members</p>
            <p className="text-xs text-neutral-500">Invite teammates and review pending invites.</p>
          </Link>
        </li>
        <li>
          <div
            aria-disabled="true"
            className="block rounded border border-neutral-800 bg-neutral-950 p-4 opacity-70"
          >
            <p className="text-sm font-medium text-neutral-200">Workspace</p>
            <p className="text-xs text-neutral-500">Name, slug, and defaults — not yet configurable.</p>
          </div>
        </li>
      </ul>

      <p className="text-[11px] text-neutral-600">
        Billing, connectors, and token budgets are not part of Phase 3 T1.
      </p>
    </div>
  );
}
