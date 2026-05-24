'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type PasteBriefState = { error: string | null };

const MIN_LEN = 20;
const MAX_LEN = 10_000;
const TITLE_MAX = 120;

function fallbackTitle(raw: string): string {
  const firstLine = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const seed = firstLine ?? raw.trim();
  return seed.slice(0, 80).trim() || 'Untitled brief';
}

function wordCount(raw: string): number {
  const matches = raw.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export async function createBriefFromPaste(
  _prev: PasteBriefState,
  form: FormData,
): Promise<PasteBriefState> {
  const slug = String(form.get('slug') ?? '').trim();
  const rawText = String(form.get('raw_text') ?? '');
  const rawTitle = String(form.get('title') ?? '').trim();

  if (!slug) return { error: 'Workspace missing from request.' };

  const trimmed = rawText.trim();
  if (trimmed.length < MIN_LEN) {
    return { error: `Brief must be at least ${MIN_LEN} characters.` };
  }
  if (trimmed.length > MAX_LEN) {
    return { error: `Brief must be ${MAX_LEN.toLocaleString()} characters or fewer.` };
  }
  if (rawTitle.length > TITLE_MAX) {
    return { error: `Title must be ${TITLE_MAX} characters or fewer.` };
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: workspace, error: wsErr } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (wsErr) return { error: wsErr.message };
  if (!workspace) return { error: 'Workspace not found or access denied.' };

  const title = rawTitle || fallbackTitle(trimmed);

  const { data: brief, error: briefErr } = await supabase
    .from('briefs')
    .insert({
      workspace_id: workspace.id,
      source: 'paste',
      raw_text: trimmed,
      word_count: wordCount(trimmed),
      parsed_status: 'ready',
      created_by: user.id,
    })
    .select('id')
    .single();
  if (briefErr || !brief) return { error: briefErr?.message ?? 'Failed to save brief.' };

  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .insert({
      workspace_id: workspace.id,
      brief_id: brief.id,
      title,
      status: 'open',
      created_by: user.id,
    })
    .select('id')
    .single();
  if (ticketErr || !ticket) return { error: ticketErr?.message ?? 'Failed to open ticket.' };

  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}/tickets/${ticket.id}`);
}
