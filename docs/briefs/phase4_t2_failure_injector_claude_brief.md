# CLAUDE BRIEF: Phase 4 T2 Failure Injector

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Create a controlled way to produce one honest failure state for demo and testing.

Phase 4 T1 added read-only failure evidence UI, but no failed ticket existed in dev for visual verification. T2 should add a narrowly scoped failure injector that can mark an eligible ticket as failed and write the corresponding trace event + failure packet using the existing Failure Packet Contract.

This is not retry or recovery. It is a controlled failure creation path so the UI and evidence chain can be tested.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase4_failure_governance_claude_brief.md`
3. `docs/briefs/phase4_t1_failure_packet_ui_report.md`
4. `contracts/failure-packet-contract.md`
5. `app/src/app/actions/orchestration.ts`
6. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
7. `app/src/components/tickets/FailureEvidencePanel.tsx`
8. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[ticketId]`.

## Goal

Add a controlled failure action that:

1. Appears only on eligible tickets.
2. Writes one failed workflow run or updates an injector run honestly.
3. Writes one `trace_events` row with failure event type.
4. Writes one `packets` row with `packet_type='failure'`.
5. Updates `tickets.status='failed'`.
6. Updates `tickets.failure_type`.
7. Lets the T1 Failure Evidence panel render the result.

## Eligibility

Keep eligibility conservative.

Recommended:

1. Ticket belongs to the current workspace.
2. Ticket is visible through the session/RLS client.
3. Ticket status is `open` or `in_progress`.
4. Ticket does not already have a failure packet.
5. Ticket is not `done`, `failed`, `looped`, or `needs_input`.

If a different eligibility rule is needed, document why. Do not allow failure injection on completed accepted tickets in this ticket.

## UI Scope

Add a small operator/test panel on ticket detail when eligible.

Suggested copy:

Title: `Failure test`

Body: `Create a controlled failure packet for this ticket. This is a demo/test action; no retry is wired yet.`

Button: `Inject controlled failure`

Pending: `Writing failure…`

After run, the page should show:

1. status `failed`
2. failure_type chip
3. Failure Evidence panel
4. failure packet details

Do not hide happy-path controls incorrectly. If injecting failure should supersede other actions on that ticket, hide other action buttons once status is `failed`.

## Failure Packet Shape

Use the closed taxonomy from `failure-packet-contract.md`.

Recommended fixed failure type for T2:

`execution_error`

Suggested structured body:

```json
{
  "packet_kind": "failure",
  "from": "failure-injector",
  "to": "central-orchestrator",
  "failure_type": "execution_error",
  "detail": "Controlled Phase 4 T2 failure injected for UI and evidence testing.",
  "state_at_failure": "No external tool call was attempted. This failure was created by an explicit operator test action.",
  "recovery_suggestion": "stop",
  "phase": "phase4_t2",
  "tool_use": false,
  "controlled_test": true
}
```

Suggested raw body:

```text
FAILURE PACKET
From: failure-injector
To: central-orchestrator
Work item: <ticket id>
Failure type: execution_error
Detail: Controlled Phase 4 T2 failure injected for UI and evidence testing.
State at failure: No external tool call was attempted. This failure was created by an explicit operator test action.
Recovery suggestion: stop
```

Keep the wording honest. It must be obvious this is controlled test data.

## Trace Event Shape

Suggested:

- `event_type`: `failure.injected`
- `from_agent`: `failure-injector`
- `to_agent`: `central-orchestrator`
- payload:
  - `failure_type`
  - `detail`
  - `controlled_test: true`
  - `tool_use: false`
  - `phase: "phase4_t2"`

Sequence number should be `max(seq)+1`.

## Implementation Scope

### Required

1. Add a server action for controlled failure injection.
2. Authorize through the session/RLS client first:
   - user session
   - workspace by slug
   - ticket by ID and workspace
3. Use service-role only after the RLS-gated read succeeds.
4. Check eligibility before service-role writes.
5. Write failure evidence in this order:
   - workflow run or trace as appropriate
   - trace event
   - failure packet
   - ticket status/failure_type update
6. Make the action idempotent:
   - if a failure packet already exists, do not create another.
7. Add a client button/component for eligible tickets.
8. Ensure T1 Failure Evidence panel renders the injected failure.

### Optional If Small

1. Add a dev-only visual label, such as `Controlled test failure`.
2. Add copy-smoke check that the injector does not promise retry/recovery.

Only take optional items if they remain small.

## Hard Boundaries

1. No retry button.
2. No resolve button.
3. No reroute behavior.
4. No loop behavior.
5. No schema migration.
6. No model calls.
7. No connector work.
8. No failure injection on `done` tickets.
9. No destructive deletes.
10. No service-role before RLS-gated authorization.

## Tests And Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Run browser/operator smoke:

1. Create a new paste ticket or use an `open` test ticket.
2. Click `Inject controlled failure`.
3. Confirm status becomes `failed`.
4. Confirm `failure_type: execution_error`.
5. Confirm Failure Evidence panel renders.
6. Confirm failure packet fields match the controlled-test wording.
7. Click refresh/reload and confirm no duplicate failure packet.

No `supabase db reset` is required unless schema changes happen. No schema change is expected.

## Report Requirements

Write:

`docs/briefs/phase4_t2_failure_injector_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Eligibility rules.
4. Server action write order.
5. Failure packet shape.
6. Trace event shape.
7. Idempotence behavior.
8. UI behavior.
9. Validation output with exact pass lines.
10. Operator acceptance steps and ticket ID if exercised.
11. Next recommended ticket: Phase 4 T3 Loop Signature.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Failure injection cannot be made idempotent.
2. RLS-gated authorization cannot be proven before service-role writes.
3. The action would need to mutate a completed accepted ticket.
4. The implementation starts adding retry/resolution behavior.
