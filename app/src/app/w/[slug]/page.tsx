import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { HomeIntro } from '@/components/home/HomeIntro';
import { StarterDomains } from '@/components/home/StarterDomains';
import { ActivitySections } from '@/components/home/ActivitySections';
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
    .select('name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  return (
    <div className="space-y-10">
      <HomeIntro workspaceName={workspace.name} slug={workspace.slug} />
      <StarterDomains />
      <ActivitySections />
      <ConnectorsPanel />
    </div>
  );
}
