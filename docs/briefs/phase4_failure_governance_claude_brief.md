# CLAUDE BRIEF: Phase 4 Failure And Governance Flows

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Make Dream Team honest when work fails, loops, or needs human input.

Phase 4 should avoid happy-path theater. The product needs clear behavior for:

1. Failure.
2. Loop detection.
3. Human input.
4. Retry and resolution.
5. Basic usage/cost visibility.

## Operating Mode

This is a phase-level brief, not permission to implement the whole phase in one pass.

Start each ticket by narrowing scope, naming files, and confirming validation. After every file write, immediately read back the changed file enough to prove it exists and contains the intended section. For new markdown reports, echo the first 3 non-empty lines and the line count.

## Phase 4 Exit Criteria

A forced-failure brief shows a correct inspector; a loop simulation produces `looped` status with a signature; a `needs_input` ticket can be resolved by the user; and usage/cost can be inspected at a basic level.

## Source Files To Read First

Read:

1. `docs/design/dream_team_v1_architecture_brief.md`
2. `contracts/failure-packet-contract.md`
3. `contracts/loop-termination-contract.md`
4. `contracts/trace-emitter-contract.md`
5. `docs/briefs/phase1_t6_acceptance_pass_report.md`
6. Latest Phase 2 reports, if present.
7. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
8. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each read, echo the first 3 non-empty lines.

## Recommended Ticket Sequence

### Phase 4 T1: Failure Packet UI

Goal: render failure packets clearly on ticket detail.

Scope:

1. Show failure packet type, reason, affected agent, recovery suggestion.
2. Do not create new failure semantics yet.
3. Use existing `packets` table if enough.

Exit:

1. User can distinguish normal handoff packets from failure packets.

### Phase 4 T2: Failure Injector

Goal: create a controlled way to force a failure for demo/testing.

Scope:

1. Server action or admin-only/dev-only control.
2. Writes failure packet.
3. Sets ticket status `failed`.
4. No broad destructive behavior.

Exit:

1. Forced failure appears on ticket detail and Home.

### Phase 4 T3: Loop Signature

Goal: simulate or detect a repeated loop condition.

Scope:

1. Use `tickets.loop_signature`.
2. Set status `looped`.
3. Write trace/packet evidence.

Exit:

1. Loop state is visible and explainable.

### Phase 4 T4: Needs Input Flow

Goal: let the system ask the human for missing information.

Scope:

1. Set ticket status `needs_input`.
2. Show prompt/question on ticket detail.
3. Let user submit a response.
4. Record response as packet or trace.

Exit:

1. User can unblock a `needs_input` ticket.

### Phase 4 T5: Retry/Resolve Actions

Goal: controlled recovery actions for failed/looped/needs_input tickets.

Scope:

1. Retry from last safe step.
2. Mark resolved where appropriate.
3. Preserve evidence.

Exit:

1. Recovery is visible and not a silent mutation.

### Phase 4 T6: Basic Usage Meter

Goal: show basic usage/cost using existing `workflow_runs`.

Scope:

1. Sum tokens/cost by workspace.
2. Show this in Settings or a small usage page.
3. Accuracy target is basic, not billing-grade.

Exit:

1. User sees rough usage and cost.

## Hard Boundaries

1. Do not delete evidence rows.
2. Do not hide failed states behind success language.
3. Do not allow retry to overwrite trace history.
4. Do not add billing/payment integration yet unless explicitly routed.
5. Schema migrations require RLS tests.

## Validation Stack

Every ticket:

1. `pnpm verify:supabase-project`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm exec supabase db reset`
5. `pnpm exec supabase test db`
6. Browser smoke of the failure/loop/input path.

## Reports

Reports must include:

1. What failure/governance state was tested.
2. Evidence rows written.
3. Ticket status transitions.
4. Validation output.
5. Caveats.

## Stop Conditions

Stop if:

1. A recovery action would erase evidence.
2. A failure state cannot be represented honestly with current schema.
3. A schema change is needed but RLS tests are not included.
4. The flow becomes a generic admin console rather than ticket-governance UX.
