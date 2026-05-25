# CLAUDE BRIEF: Phase 4 T1 Failure Packet UI

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Start Phase 4 by making failures visible before adding recovery actions.

Phase 2 already writes failure packets when Orchestrator classification fails. Phase 4 T1 should render those failure packets clearly on ticket detail so the user can understand what failed, where, and what the suggested recovery is.

This ticket is read-only UI. Do not create a failure injector yet. Do not add retry, resolve, reroute, or status mutation actions yet.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase4_failure_governance_claude_brief.md`
3. `docs/briefs/phase3_acceptance_report.md`
4. `docs/briefs/phase2_t2_real_orchestrator_classification_report.md`
5. `contracts/failure-packet-contract.md`
6. `app/src/app/actions/orchestration.ts`
7. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
8. `app/src/components/tickets/StatusPill.tsx`
9. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[ticketId]`.

## Goal

On ticket detail, clearly render:

1. Failure packets (`packets.packet_type='failure'`).
2. Failure trace events such as `orchestrator.failed`.
3. Rejected internal Truth packets, if present.
4. Ticket-level failure fields, if present:
   - `status='failed'`
   - `failure_type`

The user should be able to distinguish:

1. normal handoff/artifact/QA/Truth evidence
2. failure evidence
3. rejected internal review evidence

## Implementation Scope

### Required

1. Update the ticket detail page to select `failure_type` from `tickets`.
2. Derive failure packets from existing `packets`.
3. Derive rejected Truth packets from `packets.packet_type='truth'` where parsed verdict is rejected/internal fail.
4. Add a visible Failure Evidence section when applicable.
5. Show:
   - failure type
   - detail/reason
   - recovery suggestion
   - source agent / target agent if available
   - linked trace event or event type if available
6. Keep raw packet body accessible in a safe text block or details block.
7. Do not hide the existing generic packet list unless the same packet is duplicated too noisily. If deduping visually, keep evidence accessible.
8. Keep Phase 2 happy-path ticket detail unchanged.

### Optional If Small

1. Extract a presentational component such as `FailureEvidencePanel.tsx`.
2. Add copy-smoke checks that failure UI does not promise retry/resolve before those actions exist.
3. Add a small "No recovery action is wired yet" note for failed tickets.

Only take optional items if they do not add workflow behavior.

## Failure Data Shape

Use the existing data. Do not require a migration.

Known Phase 2 failure write shape from T2:

1. `workflow_runs.status='failed'`
2. `trace_events.event_type='orchestrator.failed'`
3. `packets.packet_type='failure'`
4. `tickets.status='failed'`
5. `tickets.failure_type=<closed taxonomy value>`

Failure packet fields may be in:

1. `body_parsed.failure_type`
2. `body_parsed.detail`
3. `body_parsed.recovery_suggestion`
4. `body_parsed.from`
5. `body_parsed.to`
6. `body_raw`

Be defensive: if structured fields are missing, show what is present and avoid inventing values.

## Rejected Truth Evidence

T4 can create Truth packets with verdicts like:

1. `accepted_internal`
2. `rejected_internal`

If a Truth packet is rejected:

1. render it in Failure/Governance Evidence or a separate "Rejected internal review" subsection.
2. explain that this is an internal deterministic review result.
3. do not mutate ticket status.
4. do not add retry controls.

## UI Expectations

Use current dark operator style.

Suggested layout on ticket detail:

1. Header still shows normal status pill.
2. If `status='failed'`, add a prominent but calm failure panel near the top.
3. Failure panel:
   - title: `Failure evidence`
   - subtitle: `Recorded by the workflow. No recovery action is wired yet.`
   - one card per failure packet
4. Card fields:
   - type
   - detail
   - recovery suggestion
   - source/target
   - created time
5. Raw packet block:
   - collapsed by default if long
   - no HTML rendering

Do not use alarming destructive styling. This is operator evidence, not a crash screen.

## Hard Boundaries

1. No schema migrations.
2. No model calls.
3. No failure injector.
4. No retry button.
5. No resolve button.
6. No status mutation.
7. No service-role reads.
8. No deletion or hiding of evidence rows.
9. No broad ticket detail redesign.

## Tests And Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Run browser or curl smoke where practical:

1. A normal `done` ticket still renders the happy-path sections.
2. A ticket with no failure packets does not show Failure Evidence.
3. If a failed ticket exists, it shows Failure Evidence.
4. Unauthenticated ticket detail still redirects to `/signin`.

If no failed ticket exists, document that live failure visualization is pending Phase 4 T2 Failure Injector. Do not fabricate a failed ticket in T1.

No `supabase db reset` is required unless schema changes happen. No schema change is expected.

## Report Requirements

Write:

`docs/briefs/phase4_t1_failure_packet_ui_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Failure fields rendered.
4. Rejected Truth behavior, if implemented.
5. UI behavior.
6. Validation output with exact pass lines.
7. Browser/curl smoke results.
8. Whether a failed ticket existed for live visual verification.
9. Next recommended ticket: Phase 4 T2 Failure Injector.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Existing packet shape cannot represent failure evidence honestly.
2. Ticket detail would require a broad redesign to surface failures.
3. A visible failure state requires creating new failure data.
4. The implementation starts adding retry/resolution behavior.
