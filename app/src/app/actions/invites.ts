'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateInviteToken, hashInviteToken } from '@/lib/invite/token';
import { sendInvite } from '@/lib/email/sendInvite';
import { env } from '@/env';

export type InviteState = {
  error: string | null;
  ok?: string | null;
  inviteUrl?: string | null;
};

const ROLE_VALUES = ['admin', 'member'] as const;
type Role = (typeof ROLE_VALUES)[number];

export async function createInvite(_: InviteState, form: FormData): Promise<InviteState> {
  const slug = String(form.get('slug') ?? '').trim();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const role = String(form.get('role') ?? 'member') as Role;
  if (!slug) return { error: 'Missing workspace slug.' };
  if (!email || !email.includes('@')) return { error: 'Valid email required.' };
  if (!ROLE_VALUES.includes(role)) return { error: 'Role must be admin or member.' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) return { error: 'Workspace not found or you are not a member.' };

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .rpc('create_workspace_invite', {
      p_workspace_id: workspace.id,
      p_email: email,
      p_role: role,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    })
    .single();

  if (error) return { error: error.message };

  const inviteUrl = `${env.NEXT_PUBLIC_SITE_URL}/invite/${token}`;
  await sendInvite({
    inviteeEmail: email,
    inviteUrl,
    workspaceName: workspace.name,
    invitedByEmail: user.email ?? null,
    role,
  });

  revalidatePath(`/w/${slug}/settings/members`);
  return {
    error: null,
    ok: `Invite created for ${email}. Share the link below; it expires in 7 days.`,
    inviteUrl,
  };
}

export async function acceptInviteAction(token: string): Promise<{ slug: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/invite/${token}`)}`);

  const { data: workspaceId, error } = await supabase.rpc('accept_invite', { p_token: token });
  if (error || !workspaceId) {
    throw new Error(error?.message ?? 'Invite is invalid, expired, or already used.');
  }

  const { data: ws } = await supabase
    .from('workspaces')
    .select('slug')
    .eq('id', workspaceId as string)
    .maybeSingle();
  if (!ws?.slug) throw new Error('Workspace not visible after accept — try refreshing.');

  revalidatePath('/', 'layout');
  return { slug: ws.slug };
}
