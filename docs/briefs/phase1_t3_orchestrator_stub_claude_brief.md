# CLAUDE BRIEF: Phase 1 T3 Orchestrator Stub Round-Trip

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Build the first visible orchestration round-trip for an existing open ticket.

This is a deterministic stub, not a model call. The user should be able to open a ticket created from a pasted brief, click a button, and see:

1. Ticket moves from `open` to `done`.
2. One `workflow_runs` row is written.
3. One `trace_events` row is written.
4. One `packets` row is written.
5. Ticket detail page shows the trace/packet evidence.

Keep this honest: label it as a stubbed Orchestrator classification, not real AI orchestration.

## Current State

Already complete:

1. Phase 0 auth, onboarding, workspace frame, invite flow, empty Home.
2. Phase 1 T1 DB foundation:
   - `briefs`
   - `tickets`
   - `workflow_runs`
   - `trace_events`
   - `packets`
   - `artifacts`
3. Phase 1 T2 paste brief flow:
   - `/w/[slug]/new/paste`
   - `createBriefFromPaste`
   - `/w/[slug]/tickets/[ticketId]`
   - paste creates `briefs` + `tickets`
4. `trace_events` has no direct authenticated insert policy by design. Generated trace rows must be written by a server-only privileged path.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/design/dream_team_v1_architecture_brief.md`
3. `docs/briefs/phase1_t1_database_foundation_report.md`
4. `docs/briefs/phase1_t2_paste_brief_flow_report.md`
5. `app/src/app/actions/briefs.ts`
6. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
7. `app/src/lib/supabase/server.ts`
8. `app/src/env.ts`
9. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each read, echo the first 3 non-empty lines.

## Hard Scope

In scope:

1. Add a server-only Supabase service-role helper if one does not exist.
2. Add a server action to run a deterministic Orchestrator stub for one ticket.
3. Update ticket detail page to show a "Run Orchestrator stub" action when appropriate.
4. Update ticket detail page to list trace events and packet summaries.
5. Add a focused component if helpful.
6. Add tests if the existing app setup supports them without broad setup work.
7. Write final report: `docs/briefs/phase1_t3_orchestrator_stub_report.md`

Out of scope:

1. No model API or Anthropic call.
2. No upload.
3. No generate-with-chat.
4. No Realtime/SSE.
5. No Edge Functions.
6. No schema migration.
7. No cron/background job.
8. No connector work.
9. No artifact storage or Storage buckets.

## Security And Data Boundary

This ticket introduces a server-only privileged write path because `workflow_runs`, `trace_events`, and `packets` intentionally have no authenticated client insert policy.

Rules:

1. The server action must first authenticate the user with the normal `createSupabaseServerClient()`.
2. It must verify the user can read the workspace and ticket through RLS before using service-role writes.
3. Only after that RLS-gated authorization check may it use a service-role helper.
4. Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code.
5. The service-role helper must live in a server-only module.
6. Do not import the service-role helper into any client component.
7. Do not use service role for normal paste submission.

Suggested helper:

`app/src/lib/supabase/service.ts`

Use `@supabase/supabase-js` with:

1. `env.NEXT_PUBLIC_SUPABASE_URL`
2. `env.SUPABASE_SERVICE_ROLE_KEY`

Add `import 'server-only';` at the top if available. If `server-only` is not installed/available, stop and report before adding a package unless the fix is trivial and already standard in Next.

## Stub Behavior

Recommended action name:

`runOrchestratorStub`

Recommended file:

`app/src/app/actions/orchestration.ts`

Input:

1. `slug`
2. `ticketId`

Steps:

1. Authenticate user with normal server client.
2. Resolve workspace by `slug` through RLS.
3. Resolve ticket by `ticketId` and `workspace_id` through RLS.
4. If ticket is not found, return/throw not-found-style error.
5. If ticket is already `done`, do not duplicate run/event/packet rows. Return success and redirect back to ticket detail.
6. Use service-role client for generated rows.
7. Determine next `trace_events.seq` as `coalesce(max(seq), 0) + 1` for the ticket.
8. Insert one `workflow_runs` row:
   - `workspace_id`
   - `ticket_id`
   - `run_kind = 'orchestrator'`
   - `agent_id = 'central-orchestrator'`
   - `model = 'stub'`
   - `status = 'done'`
   - `input_tokens = 0`
   - `output_tokens = 0`
   - `cost_usd = 0`
   - `ended_at = now()`
9. Insert one `trace_events` row:
   - `workspace_id`
   - `ticket_id`
   - `seq`
   - `from_agent = 'user'`
   - `to_agent = 'central-orchestrator'`
   - `event_type = 'orchestrator_stub.classified'`
   - `payload` contains:
     - `stub: true`
     - `classification: 'build'`
     - `verdict: 'ready_for_coordinator_stub'`
     - `reason: 'Deterministic Phase 1 stub; no model call performed.'`
10. Insert one `packets` row:
   - `workspace_id`
   - `ticket_id`
   - `trace_event_id`
   - `packet_type = 'handoff'`
   - `body_raw` should plainly say this is a stub.
   - `body_parsed` should include the same stub/classification/verdict fields.
11. Update ticket:
   - `status = 'done'`
   - `layer = 'build'`
   - `current_agent = 'central-orchestrator'`
12. `revalidatePath('/w/[slug]/tickets/[ticketId]')`
13. Redirect back to ticket detail.

Idempotence:

1. Running the stub twice must not create duplicate stub trace events.
2. Easiest acceptable approach: if a matching `trace_events.event_type = 'orchestrator_stub.classified'` already exists for the ticket, skip inserts and only ensure ticket status fields are set.
3. Document the chosen idempotence behavior in the report.

## Ticket Detail UI

Update `/w/[slug]/tickets/[ticketId]`:

1. If ticket status is `open`, show a form button: `Run Orchestrator stub`.
2. If ticket status is `done`, do not show the run button.
3. Show trace events sorted by `seq`.
4. Show event type, seq, created_at, from/to agents, and a concise payload summary.
5. Show packets associated with the ticket or trace event.
6. Keep the honest copy that this is a stub/no model call.
7. Do not over-design; this is an operator surface, not a marketing page.

## Validation Requirements

Run:

1. `pnpm verify:supabase-project`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm exec supabase db reset`
5. `pnpm exec supabase test db`

Browser/cloud smoke:

1. Use local dev app pointed at `dream-team-dev`.
2. Sign in to a cloud smoke user or create one if necessary.
3. Create or use an existing workspace.
4. Create a pasted brief and ticket, or use a known open ticket.
5. Open the ticket detail page.
6. Click `Run Orchestrator stub`.
7. Confirm ticket detail shows:
   - status `Done`
   - layer `build`
   - agent `central-orchestrator`
   - trace event `orchestrator_stub.classified`
   - handoff packet
8. Confirm DB readback:
   - one `workflow_runs` row
   - one matching `trace_events` row
   - one matching `packets` row
   - ticket status `done`
9. Confirm clicking/running again does not duplicate the stub trace.

Do not print secrets.

## Required Readback After Each Write

After writing or editing each file, immediately read it back and echo:

1. Path
2. Line count
3. First 3 non-empty lines

This applies to:

1. Server action files
2. Supabase helper files
3. Page files
4. Components
5. Tests
6. Report file

## Expected Files

Likely files to create:

1. `app/src/lib/supabase/service.ts`
2. `app/src/app/actions/orchestration.ts`
3. Optional: `app/src/components/tickets/TraceTimeline.tsx`
4. `docs/briefs/phase1_t3_orchestrator_stub_report.md`

Likely files to modify:

1. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`

Do not modify migrations unless stopped and approved.

## Stop Conditions

Stop and report if:

1. A schema change seems necessary.
2. The service-role helper would need to be imported into a client component.
3. RLS cannot verify user access before privileged writes.
4. Existing Supabase tests fail before your changes.
5. You need a model API to make the flow work.
6. Idempotence cannot be implemented without a migration.

## Final Report Must Include

Write `docs/briefs/phase1_t3_orchestrator_stub_report.md` with:

1. Completion status: `complete`, `blocked`, or `partial`
2. Files changed
3. Routes/actions added or changed
4. Whether a service-role helper was added and where
5. Exact generated writes: `workflow_runs`, `trace_events`, `packets`, `tickets`
6. Idempotence behavior
7. Exact validation command outputs
8. Browser/cloud smoke summary
9. Database readback summary
10. Confirmation that no schema migration was added
11. Confirmation that no model API was called
12. Known caveats and next recommended ticket

## Next Ticket After This

If this ticket completes, the next likely ticket is:

Phase 1 T4: Home reads real recent work and shows recent briefs/tickets/workflow status instead of static empty panels.
