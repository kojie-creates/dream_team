# CLAUDE BRIEF: Phase 4 T4 Needs Input Flow

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Add the first human-input governance flow.

Phase 4 T1 made failure evidence visible. T2 created controlled failed tickets. T3 creates controlled looped tickets. T4 should let the workflow stop and ask the human for missing information, then record the human response as evidence.

This is not retry or resolve yet. T4 should create and answer `needs_input` states only.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Dirty Worktree Warning

Before editing, inspect `git status --short`.

At the time this brief was created, `app/src/app/actions/orchestration.ts` was already modified. Determine whether that belongs to Phase 4 T3 before editing. Do not overwrite or stage unrelated work.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase4_failure_governance_claude_brief.md`
3. `docs/briefs/phase4_t1_failure_packet_ui_report.md`
4. `docs/briefs/phase4_t2_failure_injector_report.md`
5. `docs/briefs/phase4_t3_loop_signature_report.md`, if present
6. `contracts/trace-emitter-contract.md`
7. `contracts/failure-packet-contract.md`
8. `app/src/app/actions/orchestration.ts`
9. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
10. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[ticketId]`.

## Goal

Add a controlled needs-input flow that:

1. Appears only on eligible tickets.
2. Lets the workflow ask one clear question.
3. Sets `tickets.status='needs_input'`.
4. Records a trace event and packet for the question.
5. Shows the question on ticket detail.
6. Lets the user submit one response.
7. Records the response as trace/packet evidence.
8. Moves the ticket back to `in_progress` or leaves it clearly answered-but-awaiting-retry, depending on current status model.

Prefer `in_progress` after response if no new status exists. Do not invent a new status without migration approval.

## Eligibility

Keep eligibility conservative.

Recommended ask-for-input eligibility:

1. Ticket belongs to current workspace.
2. Ticket is visible through session/RLS client.
3. Ticket status is `open` or `in_progress`.
4. Ticket does not already have an unresolved needs-input packet.
5. Ticket is not `done`, `failed`, `looped`, or already `needs_input`.

Recommended response eligibility:

1. Ticket status is `needs_input`.
2. The ticket has an unresolved needs-input question packet.
3. Response text is non-empty and under a small limit, such as 4,000 chars.

## Data Shape

No schema migration is expected.

Use existing `trace_events` and `packets`.

Question trace:

- `event_type`: `input.requested`
- `from_agent`: `central-orchestrator`
- `to_agent`: `user`
- payload:
  - `question`
  - `reason`
  - `phase: "phase4_t4"`
  - `tool_use: false`

Question packet:

- `packet_type`: `trace`
- `body_parsed.packet_kind`: `needs_input`
- fields:
  - `question`
  - `reason`
  - `resolved: false`

Response trace:

- `event_type`: `input.responded`
- `from_agent`: `user`
- `to_agent`: `central-orchestrator`
- payload:
  - `response`
  - `question_packet_id`
  - `phase: "phase4_t4"`
  - `tool_use: false`

Response packet:

- `packet_type`: `trace`
- `body_parsed.packet_kind`: `input_response`
- fields:
  - `response`
  - `question_packet_id`
  - `resolved: true`

If an unresolved question cannot be marked resolved without updating old packet rows, do not update the old packet. Instead, consider it resolved by the presence of a linked response packet. Preserve append-only evidence.

## UI Scope

Ticket detail should show:

1. Needs Input panel when `status='needs_input'` or unresolved needs-input packet exists.
2. The question and reason.
3. A response form when response is still needed.
4. Submitted response evidence after response exists.
5. Clear note that recovery/retry happens in Phase 4 T5.

Add a small controlled "Ask for input" test panel only on eligible tickets if needed to create test data.

Do not call this a chat surface. This is a single structured human-response flow.

## Hard Boundaries

1. No schema migration unless append-only representation is impossible.
2. No model calls.
3. No retry/resolve action beyond recording the human answer.
4. No service-role before RLS-gated authorization.
5. No edits/deletes of old trace or packet evidence.
6. No connector work.
7. No broad chat UI.
8. No mutation of completed `done` tickets.

## Tests And Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Browser/operator smoke:

1. Create or open an eligible ticket.
2. Trigger controlled needs-input request.
3. Confirm ticket status becomes `needs_input`.
4. Confirm question appears on ticket detail.
5. Submit a response.
6. Confirm response evidence appears.
7. Confirm no duplicate question/response on refresh.

No `supabase db reset` is required unless schema changes happen.

## Report Requirements

Write:

`docs/briefs/phase4_t4_needs_input_flow_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Eligibility rules.
4. Question trace/packet shape.
5. Response trace/packet shape.
6. Ticket status transitions.
7. UI behavior.
8. Validation output with exact pass lines.
9. Operator acceptance ticket ID if exercised.
10. Next recommended ticket: Phase 4 T5 Retry / Resolve Actions.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Needs-input cannot be represented append-only with existing tables.
2. RLS-gated authorization cannot be proven before privileged writes.
3. The flow requires a broad chat system.
4. The implementation starts adding retry or recovery semantics.
