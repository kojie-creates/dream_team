-- Phase 1 T1 — workflow foundation tables + RLS.
-- Source: docs/design/dream_team_v1_architecture_brief.md §2 (Phase 1 simplifications).
-- Tables: briefs, tickets, workflow_runs, trace_events, packets, artifacts.
-- All workspace-scoped. trace_events is append-only (no update/delete policies).
-- Client writes restricted to briefs+tickets inserts; runs/events/packets/artifacts are server/service-role only.

-- ---------------------------------------------------------------------------
-- briefs — user-supplied input (paste/file/generate/connector).
-- ---------------------------------------------------------------------------
create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source text not null check (source in ('paste','file','generate','connector')),
  storage_path text,
  raw_text text,
  word_count integer not null default 0 check (word_count >= 0),
  parsed_status text not null default 'ready' check (parsed_status in ('pending','ready','failed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index briefs_workspace_created_idx on public.briefs (workspace_id, created_at desc);

comment on table public.briefs is 'User-submitted brief. One row per submission; paste path skips storage_path.';

-- ---------------------------------------------------------------------------
-- tickets — work item produced from a brief.
-- ---------------------------------------------------------------------------
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  wq_id text unique,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brief_id uuid references public.briefs(id) on delete set null,
  title text not null,
  status text not null default 'open' check (status in ('open','in_progress','done','failed','looped','needs_input')),
  layer text,
  current_agent text,
  failure_type text,
  loop_signature text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tickets_workspace_status_updated_idx on public.tickets (workspace_id, status, updated_at desc);
create index tickets_workspace_current_agent_idx on public.tickets (workspace_id, current_agent);

create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

comment on table public.tickets is 'Work item. wq_id is the legacy ticket id from the Markdown work queue era.';

-- ---------------------------------------------------------------------------
-- workflow_runs — per-agent run record (Phase 1 name for agent_runs).
-- ---------------------------------------------------------------------------
create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  run_kind text not null default 'orchestrator' check (run_kind in ('orchestrator','coordinator','specialist','qa','truth')),
  agent_id text,
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(10,4) not null default 0 check (cost_usd >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'pending' check (status in ('pending','running','done','failed'))
);

create index workflow_runs_ticket_started_idx on public.workflow_runs (ticket_id, started_at);

comment on table public.workflow_runs is 'One row per agent invocation. Server/service-role writes only in Phase 1.';

-- ---------------------------------------------------------------------------
-- trace_events — append-only event log per ticket.
-- ---------------------------------------------------------------------------
create table public.trace_events (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  seq bigint not null check (seq > 0),
  from_agent text,
  to_agent text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (ticket_id, seq)
);

create index trace_events_ticket_seq_idx on public.trace_events (ticket_id, seq);

comment on table public.trace_events is 'Append-only. No client insert/update/delete policies in Phase 1.';

-- ---------------------------------------------------------------------------
-- packets — handoff/failure/trace/truth/artifact packets emitted by agents.
-- ---------------------------------------------------------------------------
create table public.packets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  trace_event_id bigint references public.trace_events(id) on delete set null,
  packet_type text not null check (packet_type in ('handoff','failure','trace','truth','artifact')),
  body_raw text,
  body_parsed jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index packets_ticket_type_idx on public.packets (ticket_id, packet_type);

comment on table public.packets is 'Structured packets emitted at handoffs. Server/service-role writes only in Phase 1.';

-- ---------------------------------------------------------------------------
-- artifacts — produced files/markdown/bundles. Storage buckets deferred.
-- ---------------------------------------------------------------------------
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  kind text not null check (kind in ('markdown','file','bundle','json')),
  storage_path text,
  mime_type text,
  bytes integer check (bytes is null or bytes >= 0),
  created_at timestamptz not null default now()
);

create index artifacts_ticket_created_idx on public.artifacts (ticket_id, created_at desc);

comment on table public.artifacts is 'Produced outputs. Storage bucket integration deferred to Phase 2.';

-- ---------------------------------------------------------------------------
-- Enable RLS on all six tables.
-- ---------------------------------------------------------------------------
alter table public.briefs        enable row level security;
alter table public.tickets       enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.trace_events  enable row level security;
alter table public.packets       enable row level security;
alter table public.artifacts     enable row level security;

-- ---------------------------------------------------------------------------
-- Read policies — workspace members.
-- ---------------------------------------------------------------------------
create policy briefs_member_select on public.briefs
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy tickets_member_select on public.tickets
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy workflow_runs_member_select on public.workflow_runs
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy trace_events_member_select on public.trace_events
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy packets_member_select on public.packets
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy artifacts_member_select on public.artifacts
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Client write policies — briefs + tickets only. Member + self-as-creator.
-- workflow_runs, trace_events, packets, artifacts: no client insert policy
-- (service role bypasses RLS for server-generated rows). No delete policies.
-- trace_events: no update policy either (append-only invariant).
-- ---------------------------------------------------------------------------
create policy briefs_member_insert on public.briefs
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy tickets_member_insert on public.tickets
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_workspace_member(workspace_id)
  );
