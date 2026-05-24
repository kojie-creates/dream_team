import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PasteBriefForm } from '@/components/briefs/PasteBriefForm';

export default async function PasteBriefPage({
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-neutral-500">{workspace.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Paste a brief</h1>
        <p className="text-sm text-neutral-400">
          Drop in the text. We will open a ticket against it. Upload and Generate paths arrive later.
        </p>
      </header>

      <PasteBriefForm slug={workspace.slug} />

      <Link
        href={`/w/${workspace.slug}`}
        className="inline-block text-xs text-neutral-500 hover:text-neutral-300"
      >
        ← Back to {workspace.name}
      </Link>
    </div>
  );
}
