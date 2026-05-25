import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CONNECTOR_CATALOG } from '@/lib/connectors/catalog';
import { ConnectorCard, type ConnectorRow } from '@/components/connectors/ConnectorCard';
import type { ConnectorProvider, ConnectorStatus } from '@/lib/connectors/types';

export default async function ConnectorsSettingsPage({
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

  // RLS-gated. Members see metadata for their workspace only. Service-role
  // is never used here; token rows live in connector_tokens and remain
  // invisible to authenticated clients.
  const { data: connectorRows } = await supabase
    .from('connectors')
    .select('id, provider, status, scopes, connected_at, last_sync_at, last_error')
    .eq('workspace_id', workspace.id);

  type RawRow = {
    id: string;
    provider: string;
    status: string;
    scopes: string[] | null;
    connected_at: string | null;
    last_sync_at: string | null;
    last_error: string | null;
  };
  const byProvider = new Map<ConnectorProvider, ConnectorRow>();
  for (const r of (connectorRows ?? []) as RawRow[]) {
    byProvider.set(r.provider as ConnectorProvider, {
      id: r.id,
      provider: r.provider,
      status: r.status as ConnectorStatus,
      scopes: r.scopes ?? [],
      connected_at: r.connected_at,
      last_sync_at: r.last_sync_at,
      last_error: r.last_error,
    });
  }

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
          {' · '}Connectors
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Connectors</h1>
        <p className="text-sm text-neutral-400">
          Connect external tools after you review scopes and boundaries.
        </p>
      </header>

      <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-4 text-xs text-amber-100/90">
        <p className="font-medium uppercase tracking-wider text-amber-300/80">
          Security boundary
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>
            Tokens are stored server-side only. Browser clients can see connector status, not
            token material.
          </li>
          <li>
            Phase 5 starts read-only. No automated sending, posting, or writing happens through
            these connectors yet.
          </li>
          <li>
            Connecting a provider takes you through that provider&apos;s consent screen. You can
            revoke access at any time from the provider account settings.
          </li>
        </ul>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {CONNECTOR_CATALOG.map((entry) => (
          <ConnectorCard
            key={entry.provider}
            entry={entry}
            row={byProvider.get(entry.provider) ?? null}
          />
        ))}
      </ul>

      <p className="text-[11px] text-neutral-600">
        RLS-gated session reads only — no service-role bypass. Token vault
        (`connector_tokens`) is unreadable by browser clients regardless of role.
      </p>
    </section>
  );
}
