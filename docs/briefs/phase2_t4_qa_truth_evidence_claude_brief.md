# CLAUDE BRIEF: Phase 2 T4 QA + Truth Agent Evidence

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Complete the Phase 2 evidence chain after T3.

T2 creates the Orchestrator classification. T3 creates Coordinator routing, Specialist trace, artifact metadata, and an artifact packet. T4 should add deterministic QA and Truth Agent evidence after the artifact exists.

Do not add another model call in this ticket. Do not call this external attestation. This is internal workflow evidence.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase2_real_agent_loop_claude_brief.md`
3. `docs/briefs/phase2_t2_real_orchestrator_classification_report.md`
4. `docs/briefs/phase2_t3_coordinator_specialist_artifact_report.md`
5. `contracts/trace-emitter-contract.md`
6. `contracts/failure-packet-contract.md`
7. `app/src/app/actions/orchestration.ts`
8. `app/src/components/tickets/RunSpecialistPassButton.tsx`
9. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
10. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`
11. `app/supabase/tests/rls/workflow_runs_traces_packets_artifacts.test.sql`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[ticketId]`.

## Goal

For a ticket that has already completed the T3 Coordinator + Specialist artifact pass:

1. QA writes one workflow run.
2. QA writes one trace event.
3. QA writes one validation packet.
4. Truth Agent writes one workflow run.
5. Truth Agent writes one trace event.
6. Truth Agent writes one final verdict packet.
7. Ticket remains `done` or becomes `done` only after artifact + QA packet + Truth packet exist.
8. Ticket detail clearly separates:
   - trace
   - artifact evidence
   - QA evidence
   - Truth evidence

## Expected User Flow

1. User pastes a brief.
2. User opens the ticket.
3. User runs Orchestrator classification.
4. User runs Coordinator + Specialist pass.
5. User sees artifact evidence.
6. User sees a new T4 action, such as `Run QA + Truth Review`.
7. User clicks it.
8. QA and Truth evidence appears.
9. Ticket detail shows the full internal chain.

If T3 currently marks the ticket `done`, T4 may still operate on `done` tickets that have an artifact but no QA/Truth packets. Do not force a schema change just to introduce an intermediate status unless the existing state model makes honest representation impossible.

## Implementation Scope

### Required

1. Add a server action for QA + Truth review.
2. Authorize through the session/RLS client first:
   - user session
   - workspace by slug
   - ticket by ID and workspace
   - existing artifact or artifact packet
   - existing `specialist.artifact.created` trace event
3. Use service-role only after the RLS-gated read succeeds.
4. Require the ticket to have:
   - `orchestrator.classified`
   - `coordinator.routed`
   - `specialist.artifact.created`
   - at least one `artifacts` row or linked artifact packet
5. Write a QA workflow run.
6. Write a QA trace event.
7. Write a QA packet.
8. Write a Truth Agent workflow run.
9. Write a Truth Agent trace event.
10. Write a Truth Agent packet.
11. Update or reaffirm ticket `status='done'` only after both packets exist.
12. Render QA and Truth evidence in the ticket detail page.
13. Add a client button for the T4 action, visible only when eligible.

### Optional If Small

1. Add a compact evidence summary strip on ticket detail.
2. Add a copy-smoke assertion that user-facing text does not overclaim external review.

Only take these optional items if they do not distract from the required evidence chain.

## QA Evidence Shape

Suggested QA trace:

- `event_type`: `qa.validated`
- `from_agent`: specialist ID or `central-orchestrator`
- `to_agent`: `qa-agent`
- payload includes:
  - artifact ID or artifact packet ID
  - checks performed
  - validation result
  - `tool_use: false`
  - `phase: "phase2_t4"`

Suggested QA packet:

- `packet_type`: `qa`
- `body_raw`: labeled-field packet with:
  - checked artifact presence
  - checked artifact packet presence
  - checked trace continuity
  - checked no tool use
  - result: `pass`
- `body_parsed`: JSON equivalent.

Keep the checks deterministic and modest. Do not pretend QA performed semantic correctness beyond what the code actually checked.

## Truth Agent Evidence Shape

Suggested Truth trace:

- `event_type`: `truth.verdict.recorded`
- `from_agent`: `qa-agent`
- `to_agent`: `truth-agent`
- payload includes:
  - QA packet ID
  - artifact packet ID
  - verdict
  - rationale
  - `external_attestation: false`
  - `tool_use: false`
  - `phase: "phase2_t4"`

Suggested Truth packet:

- `packet_type`: `truth`
- `body_raw`: labeled-field packet with:
  - final verdict: `accepted_internal`
  - evidence reviewed
  - limits of review
  - external attestation: `false`
- `body_parsed`: JSON equivalent.

The Truth packet should say plainly that it is an internal deterministic review of recorded evidence, not a regulator, customer, or third-party attestation.

## UI Expectations

Ticket detail should show:

1. Existing Orchestrator trace.
2. Existing Coordinator and Specialist trace.
3. Existing artifact section.
4. New QA evidence section.
5. New Truth evidence section.
6. T4 action button only when eligible.

Eligibility should be conservative:

1. Ticket has a Specialist artifact event.
2. Ticket has artifact evidence.
3. Ticket does not already have a QA packet.
4. Ticket does not already have a Truth packet.

If QA/Truth packets already exist, do not create duplicates. Show the existing evidence.

## Hard Boundaries

1. No new model calls in T4.
2. No connector work.
3. No schema migration unless current tables cannot represent the evidence honestly.
4. No service-role reads or writes before RLS-gated authorization.
5. Do not erase or overwrite trace history.
6. Do not claim external attestation.
7. Do not silently convert failure or loop states into success.
8. Do not add Phase 4 retry/failure inspector behavior here.

## Tests And Validation

Run:

1. `pnpm model:smoke`
2. `pnpm copy:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase db reset`
7. `pnpm exec supabase test db`

Add tests if practical:

1. Static copy-smoke check that T4 copy does not use `attested`, `certified`, or `external review` unless negated clearly.
2. Helper-level test for deterministic QA/Truth packet builders, if packet construction is extracted.
3. RLS test only if schema or policy changes occur. No schema change is expected.

For browser or operator smoke, document exact steps:

1. Create or use a ticket.
2. Run Orchestrator classification.
3. Run Coordinator/Specialist pass.
4. Run QA + Truth review.
5. Confirm QA packet appears.
6. Confirm Truth packet appears.
7. Confirm no duplicate packets on repeat click.

## Report Requirements

Write:

`docs/briefs/phase2_t4_qa_truth_evidence_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. QA workflow run, trace, and packet shapes.
4. Truth workflow run, trace, and packet shapes.
5. Ticket status transition or reaffirmation.
6. UI changes.
7. Validation output with exact pass lines.
8. Whether copy-smoke was extended.
9. Whether schema stayed unchanged or why a migration was required.
10. Next recommended ticket, expected to be Phase 2 T5 Live Trace Or Polling.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. The existing schema cannot represent QA/Truth evidence honestly.
2. You cannot prove RLS-gated ticket/workspace authorization before privileged writes.
3. The implementation requires another live model call.
4. The action would duplicate QA or Truth packets on repeated clicks.
5. The ticket can only be marked done by inventing evidence that was not actually checked.
