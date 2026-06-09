-- 0014_realtime_publication.sql
-- Enable Supabase Realtime (postgres_changes) on the tables the desktop dashboard
-- streams: tickets (status updates), trace_events + artifacts (append-only inserts).
-- Realtime respects RLS — a subscriber only receives rows it can SELECT, so the
-- existing member-scoped policies keep the stream workspace-scoped. The default
-- REPLICA IDENTITY (primary key) is sufficient for the INSERT/UPDATE payloads used.

alter publication supabase_realtime add table public.tickets;
alter publication supabase_realtime add table public.trace_events;
alter publication supabase_realtime add table public.artifacts;
