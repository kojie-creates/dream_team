'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type PasteBriefState = { error: string | null };
export type UploadBriefState = { error: string | null };

const MIN_LEN = 20;
const MAX_LEN = 10_000;
const TITLE_MAX = 120;
const UPLOAD_MAX_BYTES = 128 * 1024;
const ALLOWED_EXT = new Set(['.txt', '.md', '.markdown']);
const ALLOWED_MIME = new Set(['text/plain', 'text/markdown', 'text/x-markdown', '']);

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

function fileExt(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 ? lower.slice(dot) : '';
}

function titleFromFilename(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? name;
  const noExt = base.replace(/\.(txt|md|markdown)$/i, '');
  const cleaned = noExt.replace(/[_-]+/g, ' ').trim();
  return cleaned.slice(0, 80) || 'Uploaded brief';
}

export async function createBriefFromUpload(
  _prev: UploadBriefState,
  form: FormData,
): Promise<UploadBriefState> {
  const slug = String(form.get('slug') ?? '').trim();
  const rawTitle = String(form.get('title') ?? '').trim();
  const file = form.get('file');

  if (!slug) return { error: 'Workspace missing from request.' };
  if (!(file instanceof File)) return { error: 'No file received.' };
  if (file.size === 0) return { error: 'File is empty.' };
  if (file.size > UPLOAD_MAX_BYTES) {
    return { error: `File must be ${Math.floor(UPLOAD_MAX_BYTES / 1024)} KB or smaller.` };
  }

  const ext = fileExt(file.name);
  if (!ALLOWED_EXT.has(ext)) {
    return { error: 'Only .txt, .md, or .markdown files are accepted in this phase.' };
  }
  const mime = (file.type ?? '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return { error: `Unsupported file type: ${mime || 'unknown'}.` };
  }
  if (rawTitle.length > TITLE_MAX) {
    return { error: `Title must be ${TITLE_MAX} characters or fewer.` };
  }

  let decoded: string;
  try {
    const buf = await file.arrayBuffer();
    decoded = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  } catch {
    return { error: 'Could not read file as UTF-8 text.' };
  }

  const trimmed = decoded.trim();
  if (trimmed.length === 0) return { error: 'File has no readable text.' };
  if (trimmed.length < MIN_LEN) {
    return { error: `Brief must be at least ${MIN_LEN} characters after trim.` };
  }
  if (trimmed.length > MAX_LEN) {
    return { error: `Brief must be ${MAX_LEN.toLocaleString()} characters or fewer.` };
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

  const title = rawTitle || titleFromFilename(file.name);

  const { data: brief, error: briefErr } = await supabase
    .from('briefs')
    .insert({
      workspace_id: workspace.id,
      source: 'file',
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
