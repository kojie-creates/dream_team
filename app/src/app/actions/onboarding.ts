'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { slugify, withSuffix } from '@/lib/slug';

export type OnboardingState = { error: string | null };

const MAX_SLUG_ATTEMPTS = 4;

export async function completeOnboarding(
  _: OnboardingState,
  form: FormData,
): Promise<OnboardingState> {
  const name = String(form.get('name') ?? '').trim();
  if (!name) return { error: 'Workspace name required.' };
  if (name.length > 60) return { error: 'Workspace name must be 60 characters or fewer.' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const slug = slugify(name);
  let workspaceId: string | null = null;
  let workspaceSlug: string | null = null;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? slug : withSuffix(slug);
    const { data, error } = await supabase
      .rpc('create_workspace', { p_name: name, p_slug: candidate })
      .single<{ id: string; slug: string }>();

    if (!error && data) {
      workspaceId = data.id;
      workspaceSlug = data.slug;
      break;
    }
    if (error && error.code === '23505') continue; // unique violation, retry with suffix
    if (error) return { error: error.message };
  }

  if (!workspaceId || !workspaceSlug) {
    return { error: 'Could not pick a unique workspace URL. Try a different name.' };
  }

  const { error: profileErr } = await supabase
    .from('users_profile')
    .update({ default_workspace_id: workspaceId, onboarded_at: new Date().toISOString() })
    .eq('id', user.id);

  if (profileErr) return { error: profileErr.message };

  revalidatePath('/', 'layout');
  redirect(`/w/${workspaceSlug}`);
}
