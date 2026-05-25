# CLAUDE BRIEF: Phase 4 T3 Loop Signature

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Add a controlled loop simulation so looped tickets can be represented, inspected, and verified.

Phase 4 T1 made failure evidence visible. T2 added a controlled failure injector. T3 should create a similarly controlled loop state: write loop evidence, set `tickets.status='looped'`, and populate `tickets.loop_signature`.

This is not retry or recovery. Do not resolve loops yet. Do not implement a general orchestration loop detector unless it is already trivial. The goal is a safe, honest loop simulation path that lets the UI and data model prove the shape.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase4_failure_governance_claude_brief.md`
3. `docs/briefs/phase4_t1_failure_packet_ui_report.md`
4. `docs/briefs/phase4_t2_failure_injector_report.md`
5. `contracts/loop-termination-contract.md`
6. `contracts/failure-packet-contract.md`
7. `app/src/app/actions/orchestration.ts`
8. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
9. `app/src/components/tickets/FailureEvidencePanel.tsx`
10. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[ticketId]`.

## Goal

Add a controlled loop action that:

1. Appears only on eligible tickets.
2. Writes trace evidence showing a repeated route/no-state-change pattern.
3. Writes a failure packet with `failure_type='timeout'`.
4. Sets `tickets.status='looped'`.
5. Sets `tickets.loop_signature`.
6. Lets ticket detail explain the loop state clearly.

## Eligibility

Keep eligibility conservative.

Recommended:

1. Ticket belongs to the current workspace.
2. Ticket is visible through the session/RLS client.
3. Ticket status is `open` or `in_progress`.
4. Ticket has no existing failure packet.
5. Ticket has no existing `loop_signature`.
6. Ticket is not `done`, `failed`, `looped`, or `needs_input`.

Do not allow loop simulation on completed accepted tickets.

## UI Scope

Add a small operator/test panel on ticket detail when eligible.

Suggested copy:

Title: `Loop test`

Body: `Create a controlled loop signature for this ticket. This is a demo/test action; no recovery action is wired yet.`

Button: `Inject controlled loop`

Pending: `Writing loop…`

After run, the page should show:

1. status `looped`
2. loop signature chip or panel
3. Failure Evidence panel or Loop Evidence panel showing timeout failure
4. no retry/resolve behavior

## Loop Signature

Use the existing `tickets.loop_signature` column.

Recommended deterministic signature:

`loop:phase4_t3:<ticketId>:failure-injector->central-orchestrator`

If that is too long or awkward, use a stable hash-like string, but it must be deterministic and human-explainable in the report.

## Trace Event Shape

The Loop Termination Contract says a loop is detected when two consecutive trace events have the same `from` and `to` agents with no state change in between.

For T3 simulation, write two consecutive trace events:

1. `event_type='loop.iteration.detected'`
2. `event_type='loop.iteration.detected'`

Both:

- `from_agent='loop-simulator'`
- `to_agent='central-orchestrator'`
- payload includes:
  - `loop_signature`
  - `iteration_count`
  - `max_iterations`
  - `state_changed: false`
  - `controlled_test: true`
  - `tool_use: false`
  - `phase: "phase4_t3"`

Then write a final trace event:

- `event_type='loop.terminated'`
- `from_agent='central-orchestrator'`
- `to_agent='user'`
- payload includes:
  - `loop_signature`
  - `failure_type: "timeout"`
  - `detail: "loop detected - no state change between iterations"`
  - `controlled_test: true`
  - `tool_use: false`
  - `phase: "phase4_t3"`

If fewer trace events are chosen, explain why. The preferred shape is two repeated iterations plus termination.

## Failure Packet Shape

Use `packet_type='failure'` because the loop contract says to emit a failure packet.

Structured body:

```json
{
  "packet_kind": "failure",
  "from": "central-orchestrator",
  "to": "user",
  "failure_type": "timeout",
  "detail": "loop detected - no state change between iterations",
  "state_at_failure": "Two consecutive controlled loop iterations used the same from/to agents with state_changed=false.",
  "recovery_suggestion": "stop",
  "loop_signature": "<signature>",
  "phase": "phase4_t3",
  "tool_use": false,
  "controlled_test": true
}
```

Keep the wording honest. It must be obvious this is controlled test data.

## Implementation Scope

### Required

1. Add a server action for controlled loop simulation.
2. Authorize through the session/RLS client first:
   - user session
   - workspace by slug
   - ticket by ID and workspace
3. Use service-role only after the RLS-gated read succeeds.
4. Check eligibility before service-role writes.
5. Write loop evidence:
   - workflow run or runs
   - trace events
   - failure packet
   - ticket status/loop_signature update
6. Make the action idempotent:
   - if `loop_signature` exists or loop failure packet exists, do not create another.
7. Add a client button/component for eligible tickets.
8. Render loop signature visibly on ticket detail.

### Optional If Small

1. Add a dedicated Loop Evidence subsection inside or near the Failure Evidence panel.
2. Add copy-smoke checks that loop UI does not promise retry/resolve.

Only take optional items if they remain small.

## Hard Boundaries

1. No retry button.
2. No resolve button.
3. No reroute behavior.
4. No needs-input behavior.
5. No schema migration.
6. No model calls.
7. No connector work.
8. No loop simulation on `done` tickets.
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
2. Click `Inject controlled loop`.
3. Confirm status becomes `looped`.
4. Confirm loop signature appears.
5. Confirm failure packet with `failure_type='timeout'` appears.
6. Confirm trace sequence shows repeated iteration and termination.
7. Refresh/reload and confirm no duplicate loop packet/signature.

No `supabase db reset` is required unless schema changes happen. No schema change is expected.

## Report Requirements

Write:

`docs/briefs/phase4_t3_loop_signature_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Eligibility rules.
4. Loop signature format.
5. Server action write order.
6. Trace event shape.
7. Failure packet shape.
8. Idempotence behavior.
9. UI behavior.
10. Validation output with exact pass lines.
11. Operator acceptance steps and ticket ID if exercised.
12. Next recommended ticket: Phase 4 T4 Needs Input Flow.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Loop simulation cannot be made idempotent.
2. RLS-gated authorization cannot be proven before service-role writes.
3. The action would need to mutate a completed accepted ticket.
4. The implementation starts adding retry/resolution behavior.
