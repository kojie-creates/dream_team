# CLAUDE BRIEF: Phase 2 T3 Coordinator + Specialist Stub Artifact

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Build the next step after Phase 2 T2 classification.

T2 moved the Orchestrator from a Phase 1 stub to a bounded server-side model classification path. T3 should keep the next step deterministic: after a ticket has been classified and set to `in_progress`, route it through one Coordinator trace and one Specialist artifact, then make the artifact visible on the ticket page.

Do not add another model call in this ticket. The point is to prove the product loop and evidence shape before multiplying model surfaces.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase2_real_agent_loop_claude_brief.md`
3. `docs/briefs/phase2_t2_real_orchestrator_classification_report.md`
4. `contracts/trace-emitter-contract.md`
5. `contracts/failure-packet-contract.md`
6. `app/src/app/actions/orchestration.ts`
7. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
8. `app/src/components/tickets/RunOrchestratorStubButton.tsx`
9. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`
10. `app/supabase/tests/rls/workflow_runs_traces_packets_artifacts.test.sql`

After each file read, echo the first 3 non-empty lines.

## Goal

For a ticket that has already completed Orchestrator classification:

1. Coordinator writes a routing trace event.
2. Specialist writes one small artifact row.
3. Specialist writes a handoff/completion packet linked to the trace.
4. Ticket status becomes `done`.
5. Ticket detail shows the artifact clearly.
6. Home and ticket list reflect the completed status through existing live reads.

## Expected User Flow

1. User pastes a brief.
2. User opens the ticket.
3. User clicks `Run Orchestrator`.
4. T2 classification runs and sets ticket to `in_progress`.
5. User sees a new T3 action, such as `Run Specialist Pass`.
6. User clicks it.
7. Coordinator and Specialist trace events appear.
8. Artifact appears on the ticket detail page.
9. Ticket status becomes `done`.

If you can safely combine T2 and T3 behind one button without broad refactor, note that option in the report, but do not combine by default. Keep this ticket simple and inspectable.

## Implementation Scope

### Required

1. Add a server action for the Coordinator + Specialist pass.
2. Authorize through the session/RLS client first:
   - user session
   - workspace by slug
   - ticket by ID and workspace
   - associated brief if needed
3. Use service-role only after the RLS-gated read succeeds.
4. Require the ticket to already have an `orchestrator.classified` trace event.
5. Write a Coordinator trace event.
6. Write a Specialist trace event.
7. Write one artifact row.
8. Write one packet row tied to the Specialist trace.
9. Update the ticket to `done`, with an appropriate `current_agent` and stable layer value.
10. Render artifacts on the ticket detail page.
11. Add a client button for the T3 action, visible only when the ticket is eligible.
12. Sweep the old `runOrchestratorStub` alias if it is now safe and small. If not safe, leave it and document why.

### Optional If Small

1. Add a failed-to-open retry button for classification failures only.
2. Rename `RunOrchestratorStubButton.tsx` to a non-stub component name.

Only take these optional items if they do not distract from the required artifact path.

## Artifact Shape

Use the existing `artifacts` table from migration `0005`.

Suggested artifact:

- `artifact_type`: `markdown`
- `title`: a concise title derived from the brief or ticket
- `body_raw`: a short markdown artifact with:
  - source ticket title
  - classified layer
  - 3 to 5 bullet action plan or summary
  - note that this is deterministic Phase 2 T3 output, not a final autonomous agent deliverable
- `body_parsed`: structured JSON mirroring the same fields

Keep the artifact intentionally modest. The goal is evidence plumbing, not sophisticated content generation.

## Trace And Packet Expectations

Coordinator trace:

- `event_type`: `coordinator.routed`
- `from_agent`: `central-orchestrator`
- `to_agent`: a stable specialist ID
- payload includes:
  - ticket ID
  - classified layer
  - routing reason
  - `tool_use: false`
  - `phase: "phase2_t3"`

Specialist trace:

- `event_type`: `specialist.artifact.created`
- `from_agent`: the specialist ID
- `to_agent`: `qa-agent` or `truth-agent` only if that is already the local vocabulary. Otherwise keep it as a specialist completion event.
- payload includes:
  - artifact ID
  - artifact type
  - source trace event
  - `tool_use: false`
  - `phase: "phase2_t3"`

Packet:

- `packet_type`: `handoff` or the closest existing packet type.
- `body_raw`: labeled-field packet with enough detail for a human reviewer.
- `body_parsed`: JSON equivalent.
- Link to the Specialist trace event.

## UI Expectations

Ticket detail should show:

1. Existing trace events.
2. Existing packets.
3. New artifact section.
4. T3 action button only when the ticket is eligible.

Eligibility should be conservative:

1. Ticket status is `in_progress`.
2. The ticket has an `orchestrator.classified` trace event.
3. No artifact already exists for this ticket.

If an artifact already exists, do not create duplicates. Show the artifact.

## Hard Boundaries

1. No new model calls in T3.
2. No connector work.
3. No schema migration unless a critical blocker appears.
4. No service-role reads or writes before RLS-gated authorization.
5. Do not erase or overwrite trace history.
6. Do not mark a ticket `done` unless the artifact row and packet row both exist.
7. Do not widen into QA + Truth Agent evidence. That is Phase 2 T4.

## Tests And Validation

Run:

1. `pnpm model:smoke`
2. `pnpm verify:supabase-project`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm exec supabase db reset`
6. `pnpm exec supabase test db`

Add tests if practical:

1. Static smoke asserting no "stub" wording remains in user-facing T3 flow.
2. Server action or helper unit test if the orchestration logic is extracted into a testable function.
3. RLS test only if schema or policy changes occur. No schema change is expected.

For browser or operator smoke, document exact steps:

1. Create or use a ticket.
2. Run Orchestrator classification.
3. Run Coordinator/Specialist pass.
4. Confirm ticket status is `done`.
5. Confirm trace events, packet, and artifact are visible.

## Report Requirements

Write:

`docs/briefs/phase2_t3_coordinator_specialist_artifact_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Trace rows written by the new action.
4. Artifact row shape.
5. Packet row shape.
6. Ticket status transition.
7. Validation output with exact pass lines.
8. Whether `runOrchestratorStub` alias was removed or retained.
9. Whether failed-to-open retry UI was added or deferred.
10. Next recommended ticket, expected to be Phase 2 T4 QA + Truth Agent Evidence.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. The existing schema cannot represent artifact output honestly.
2. You cannot prove RLS-gated ticket/workspace authorization before privileged writes.
3. The implementation requires another live model call.
4. The action would duplicate artifacts on repeated clicks.
5. The ticket cannot reach `done` without inventing QA or Truth Agent evidence.
