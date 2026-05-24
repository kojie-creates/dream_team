import { createSupabaseServerClient } from '@/lib/supabase/server';

export type WorkspaceListItem = { id: string; slug: string; name: string };

export async function listMyWorkspaces(): Promise<WorkspaceListItem[]> {
  const supabase = await createSupabaseServerClient();
  // RLS gates rows to workspaces the caller is a member of.
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, slug, name')
    .order('name', { ascending: true });
  if (error || !data) return [];
  return data.map((w) => ({ id: w.id, slug: w.slug, name: w.name }));
}
