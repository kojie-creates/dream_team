import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: profile } = await supabase
    .from('users_profile')
    .select('onboarded_at, default_workspace_id, display_name')
    .eq('id', user.id)
    .maybeSingle();

  // Already onboarded — jump to their workspace.
  if (profile?.onboarded_at && profile.default_workspace_id) {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('slug')
      .eq('id', profile.default_workspace_id)
      .maybeSingle();
    if (ws?.slug) redirect(`/w/${ws.slug}`);
  }

  const defaultName = profile?.display_name
    ? `${profile.display_name}'s workspace`
    : (user.email?.split('@')[0] ?? 'My') + ' workspace';

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12 text-neutral-100">
      <OnboardingFlow defaultName={defaultName} />
    </main>
  );
}
