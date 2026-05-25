# CLAUDE BRIEF: Phase 4 T5 Retry / Resolve Actions

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Add controlled recovery actions after failure, loop, and needs-input states are visible and evidenced.

T1 through T4 should give the app failure visibility, controlled failure data, loop signatures, and human-input evidence. T5 may now add limited recovery controls that preserve evidence and make state changes explicit.

This ticket must not erase history or silently turn failure into success.

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
5. `docs/briefs/phase4_t3_loop_signature_report.md`
6. `docs/briefs/phase4_t4_needs_input_flow_report.md`
7. `contracts/failure-packet-contract.md`
8. `contracts/loop-termination-contract.md`
9. `app/src/app/actions/orchestration.ts`
10. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
11. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[ticketId]`.

## Goal

Add narrow recovery actions for:

1. Failed tickets.
2. Looped tickets.
3. Needs-input tickets after a response exists.

Each action must:

1. Be explicit in UI.
2. Write trace evidence.
3. Write a packet recording the recovery decision.
4. Preserve all previous failure/loop/input evidence.
5. Move the ticket to the next honest state.

## Recovery Actions

### Failed Ticket

Action: `Reopen for orchestrator`

Eligibility:

1. `status='failed'`
2. at least one failure packet exists

Effect:

1. Write `recovery.requested` trace.
2. Write recovery packet.
3. Update ticket:
   - `status='open'`
   - `current_agent='central-orchestrator'`
   - keep `failure_type` as historical field unless product requires clearing. Prefer not clearing in T5.

### Looped Ticket

Action: `Hold for human review`

Eligibility:

1. `status='looped'`
2. `loop_signature` exists

Effect:

1. Write `recovery.hold_requested` trace.
2. Write recovery packet.
3. Update ticket:
   - `status='needs_input'`
   - keep `loop_signature`
   - current agent can be `human-review`

### Needs Input Ticket

Action: `Resume after response`

Eligibility:

1. `status='needs_input'`
2. input response packet exists

Effect:

1. Write `recovery.resumed` trace.
2. Write recovery packet.
3. Update ticket:
   - `status='in_progress'`
   - `current_agent='central-orchestrator'`

If T4 already resumes after response, this T5 action should instead be disabled or omitted for answered tickets and the report should explain why.

## Packet Shape

Use `packet_type='trace'` with `body_parsed.packet_kind='recovery'` unless an existing packet type is more appropriate.

Structured body:

```json
{
  "packet_kind": "recovery",
  "action": "reopen_for_orchestrator | hold_for_human_review | resume_after_response",
  "previous_status": "...",
  "next_status": "...",
  "reason": "...",
  "preserves_evidence": true,
  "phase": "phase4_t5",
  "tool_use": false
}
```

Do not delete, overwrite, or hide old packets.

## UI Scope

Add a small Recovery Actions panel on ticket detail.

Show only actions that are eligible.

Each action card must show:

1. Action name.
2. What status change will happen.
3. What evidence will be preserved.
4. Button.

No action should imply automatic success. These are state-management controls, not model execution.

## Hard Boundaries

1. No schema migrations unless impossible without one.
2. No model calls.
3. No connector work.
4. No deletion of evidence.
5. No automatic rerun of model/classifier.
6. No recovery action on `done` tickets.
7. No broad workflow engine rewrite.
8. No service-role before RLS-gated authorization.

## Tests And Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Operator smoke:

1. Use a failed ticket from T2 and reopen it.
2. Use a looped ticket from T3 and hold it for human review.
3. Use a needs-input ticket from T4 and resume it if eligible.
4. Confirm prior packets/traces remain visible.
5. Confirm recovery trace/packet appears.

No `supabase db reset` is required unless schema changes happen.

## Report Requirements

Write:

`docs/briefs/phase4_t5_retry_resolve_actions_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Actions implemented.
4. Eligibility rules.
5. Status transitions.
6. Recovery packet shape.
7. Evidence preservation behavior.
8. Validation output with exact pass lines.
9. Operator acceptance ticket IDs if exercised.
10. Next recommended ticket: Phase 4 T6 Basic Usage Meter.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Recovery would require deleting or rewriting evidence.
2. Existing status fields cannot represent the next state honestly.
3. Recovery would require re-running model calls.
4. RLS-gated authorization cannot be proven before privileged writes.
