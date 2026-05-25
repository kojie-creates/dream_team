# CLAUDE BRIEF: Phase 2 Real Agent Loop

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Turn the Phase 1 stub loop into the first real agent loop.

Phase 1 proved the product loop:

`paste brief -> ticket -> orchestrator stub -> workflow run -> trace event -> packet -> ticket done -> Home updates`

Phase 2 replaces the stub with a bounded, server-side agent execution path that can produce a real artifact and preserve evidence.

## Operating Mode

This is a phase-level brief, not permission to implement the whole phase in one pass.

Start each ticket by narrowing scope, naming files, and confirming validation. After every file write, immediately read back the changed file enough to prove it exists and contains the intended section. For new markdown reports, echo the first 3 non-empty lines and the line count.

## Phase 2 Exit Criteria

A real brief produces a real artifact, with trace evidence visible on the ticket page, and workspace isolation preserved.

Minimum end-to-end path:

1. User pastes a brief.
2. Ticket opens.
3. Orchestrator performs a real classification using a server-side model call.
4. Coordinator routes to one specialist.
5. Specialist produces a small artifact.
6. QA step records a validation packet.
7. Truth Agent step records a verdict packet.
8. Ticket reaches `done`.
9. Ticket detail shows trace, packets, and artifact.
10. Home reflects the updated work.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/design/dream_team_v1_architecture_brief.md`
3. `docs/briefs/phase1_t6_acceptance_pass_report.md`
4. `docs/demo/phase1_demo_script.md`
5. `contracts/trace-emitter-contract.md`
6. `contracts/failure-packet-contract.md`
7. `contracts/loop-termination-contract.md`
8. `app/src/app/actions/orchestration.ts`
9. `app/src/lib/supabase/service.ts`
10. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
11. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each read, echo the first 3 non-empty lines.

## Recommended Ticket Sequence

Do not try to build all of Phase 2 in one pass. Split into tickets.

### Phase 2 T1: Model Provider Boundary

Goal: add a server-only model provider wrapper and configuration validation.

Scope:

1. Add server-only model client module.
2. Add env validation for model API key.
3. Add one dry-run or mockable classification function.
4. No UI changes except maybe disabled state copy if needed.
5. No DB writes beyond existing stub path.

Exit:

1. Server code can call a model provider in a controlled way.
2. No key reaches client code.
3. Tests or a documented smoke prove the wrapper works.

### Phase 2 T2: Real Orchestrator Classification

Goal: replace the stub classification payload with a real bounded classification.

Scope:

1. Reuse existing ticket detail action shape.
2. Read ticket and brief through RLS first.
3. Use service-role only after user authorization.
4. Write `workflow_runs`, `trace_events`, and `packets`.
5. Keep status `in_progress` or `done` depending on whether downstream is present.

Exit:

1. Ticket trace shows a real classification payload.
2. Packet clearly identifies model, prompt version, and no external tool use.

### Phase 2 T3: Coordinator + Specialist Stub Artifact

Goal: add a deterministic Coordinator/Specialist path before adding more model calls.

Scope:

1. Coordinator writes a routing trace.
2. One specialist writes a markdown artifact row.
3. Ticket detail shows artifact section.
4. No Storage bucket yet unless explicitly approved.

Exit:

1. A ticket has multiple trace events.
2. Artifact is visible from DB-backed UI.

### Phase 2 T4: QA + Truth Agent Evidence

Goal: add validation and truth-review packets.

Scope:

1. QA packet records what was checked.
2. Truth packet records final verdict.
3. Ticket reaches `done` only after truth verdict.
4. UI separates trace, packets, and artifact evidence clearly.

Exit:

1. Ticket completion has visible validation chain.

### Phase 2 T5: Live Trace Or Polling

Goal: make the trace update experience smoother.

Scope:

1. Prefer simple refresh/polling first.
2. Realtime/SSE only if Phase 2 T1-T4 are stable.
3. Do not overbuild per-channel fan-out.

Exit:

1. User can see progress without manually hunting.

### Phase 2 T6: File Upload + Artifact Viewer

Goal: add file input and artifact viewing after the text path is stable.

Scope:

1. Start with `.txt` and `.md`.
2. PDF can remain deferred if extraction adds too much risk.
3. Storage must have RLS/storage tests if added.

Exit:

1. A small uploaded file can become a brief or artifact safely.

## Hard Boundaries

1. Do not expose model keys to the browser.
2. Do not use service-role before RLS-gated user/workspace/ticket authorization.
3. Do not mutate schema without a migration and RLS tests.
4. Do not add connector OAuth in Phase 2.
5. Do not introduce background jobs until the synchronous path works.
6. Keep model cost bounded and visible.

## Validation Stack

Every ticket should run:

1. `pnpm verify:supabase-project`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm exec supabase db reset`
5. `pnpm exec supabase test db`

If model calls are added:

1. Include one low-cost smoke.
2. Do not print keys.
3. Record model name, prompt version, and token/cost metadata where available.

## Reports

Each Phase 2 ticket must write a report under `docs/briefs/`.

Report must include:

1. Completion status.
2. Files changed.
3. Data writes.
4. Validation output.
5. Security boundary notes.
6. Any model calls and cost caveats.
7. Next recommended ticket.

## Stop Conditions

Stop and report if:

1. A model call requires client-side key exposure.
2. RLS cannot prove workspace membership before privileged writes.
3. A schema change lacks clear RLS test coverage.
4. A ticket needs connectors, OAuth, cron, or billing to proceed.
5. The implementation starts turning into a general agent framework instead of a narrow product loop.
