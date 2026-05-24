import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listMyWorkspaces } from '@/lib/workspace/list';
import { WorkspaceFrame } from '@/components/workspace/WorkspaceFrame';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const workspaces = await listMyWorkspaces();
  const current = workspaces.find((w) => w.slug === slug);
  if (!current) notFound();

  return (
    <WorkspaceFrame current={current} workspaces={workspaces}>
      {children}
    </WorkspaceFrame>
  );
}
