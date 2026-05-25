import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UploadBriefForm } from '@/components/briefs/UploadBriefForm';

export default async function UploadBriefPage({
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
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Upload a brief</h1>
        <p className="text-sm text-neutral-400">
          Drop in a plain-text or markdown file. We open a ticket against its contents — same shape as a paste.
        </p>
      </header>

      <UploadBriefForm slug={workspace.slug} />

      <Link
        href={`/w/${workspace.slug}`}
        className="inline-block text-xs text-neutral-500 hover:text-neutral-300"
      >
        ← Back to {workspace.name}
      </Link>
    </div>
  );
}
