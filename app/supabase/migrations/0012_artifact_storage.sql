-- Executable-core — artifact BYTES upload to Supabase Storage.
-- Source: ADR-001 Decision 7 (user-session writes, never a service-role key) +
-- the append_artifact recipe (migration 0011). Until now the runtime records an
-- `artifacts` row but storage_path stays NULL — the file bytes are never uploaded.
-- This migration adds the private bucket, member-scoped Storage RLS, and a
-- SECURITY DEFINER RPC to stamp storage_path after the upload (ordering A:
-- record row → upload bytes → set storage_path).

-- Private bucket. 10 MiB cap (agent artifacts are text/markdown/json/bundles,
-- not media). public=false → bytes are reachable ONLY through member-scoped RLS,
-- never an anonymous object URL.
insert into storage.buckets (id, name, public, file_size_limit)
values ('artifacts', 'artifacts', false, 10485760)
on conflict (id) do nothing;

-- Object-path convention: {workspace_id}/{ticket_id|_no_ticket}/{artifact_id}/{filename}
-- The FIRST path segment is the workspace_id — the RLS pivot. A member of that
-- workspace may insert (upload) and select (download) objects under it; no one
-- else can. No update/delete policy: artifacts are append-only (mirrors the
-- `artifacts` table posture). storage.foldername(name) splits the path into a
-- text[]; [1] is the leading workspace segment.

create policy "artifacts upload by workspace members"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'artifacts'
    and public.is_workspace_member( ((storage.foldername(name))[1])::uuid )
  );

create policy "artifacts read by workspace members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'artifacts'
    and public.is_workspace_member( ((storage.foldername(name))[1])::uuid )
  );

-- set_artifact_storage_path — stamp storage_path on an existing artifact row after
-- its bytes are uploaded. The `artifacts` table has no client UPDATE policy
-- (migration 0005), so this SECURITY DEFINER RPC performs the update after
-- asserting the caller is authenticated and a member of the artifact's workspace.
-- Mirrors append_artifact (0011): search_path='', revoke anon, grant authenticated.
create or replace function public.set_artifact_storage_path(
  p_artifact_id uuid,
  p_storage_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select workspace_id into v_ws from public.artifacts where id = p_artifact_id;
  if v_ws is null then
    raise exception 'artifact % not found', p_artifact_id using errcode = '23503';
  end if;
  if not public.is_workspace_member(v_ws) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  update public.artifacts set storage_path = p_storage_path where id = p_artifact_id;
end;
$$;

revoke all on function public.set_artifact_storage_path(uuid, text) from public;
revoke execute on function public.set_artifact_storage_path(uuid, text) from anon;
grant execute on function public.set_artifact_storage_path(uuid, text) to authenticated;
