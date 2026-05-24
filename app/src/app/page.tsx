import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/signin');

  const { data: profile } = await supabase
    .from('users_profile')
    .select('onboarded_at, default_workspace_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.onboarded_at && profile.default_workspace_id) {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('slug')
      .eq('id', profile.default_workspace_id)
      .maybeSingle();
    if (ws?.slug) redirect(`/w/${ws.slug}`);
  }

  redirect('/onboarding');
}
