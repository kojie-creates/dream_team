import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadContractCatalog } from '@/lib/contracts/catalog';
import { ContractCatalog } from '@/components/contracts/ContractCatalog';

export default async function ContractsPage({
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

  const entries = await loadContractCatalog();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-neutral-500">{workspace.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Contracts</h1>
        <p className="text-sm text-neutral-400">
          Read-only governance contracts used by Dream Team workflows.
        </p>
        <p className="text-[11px] text-neutral-500">{entries.length} contracts</p>
      </header>

      <ContractCatalog
        entries={entries}
        linkPrefix={`/w/${workspace.slug}/contracts`}
      />
    </div>
  );
}
