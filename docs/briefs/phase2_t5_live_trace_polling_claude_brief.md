# CLAUDE BRIEF: Phase 2 T5 Live Trace / Polling

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Make ticket progress easier to watch without introducing a full Realtime/SSE architecture yet.

T2 added real Orchestrator classification. T3 added Coordinator + Specialist artifact output. T4 added deterministic QA + Truth evidence. T5 should improve the user experience around those steps so the user can see progress and refresh state without manually navigating away or guessing what changed.

Prefer simple polling or explicit refresh first. Do not build an event streaming system unless polling cannot meet the Phase 2 need.

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
5. `docs/briefs/phase2_t4_qa_truth_evidence_report.md`
6. `app/src/app/actions/orchestration.ts`
7. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
8. `app/src/components/tickets/RunOrchestratorStubButton.tsx`
9. `app/src/components/tickets/RunSpecialistPassButton.tsx`
10. `app/src/components/tickets/RunQaTruthReviewButton.tsx`
11. `app/src/app/w/[slug]/page.tsx`
12. `app/src/components/home/ActivitySections.tsx`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[ticketId]`.

## Goal

Add a modest live-progress UX for the ticket detail page and, if small, the Home activity surface.

The user should be able to:

1. Run Orchestrator classification.
2. See the page update or be guided to refresh.
3. Run Coordinator + Specialist pass.
4. See trace/artifact evidence update.
5. Run QA + Truth review.
6. See QA/Truth evidence update.
7. Avoid duplicate clicks while an action is pending.
8. Understand what step is currently available.

## Expected User Flow

1. User opens a ticket.
2. Ticket detail shows a compact progress strip:
   - Brief
   - Orchestrator
   - Coordinator/Specialist
   - QA
   - Truth
3. Completed steps are visually distinct from available or waiting steps.
4. When the user clicks an action, the button shows a pending state.
5. After the action resolves, the page refreshes automatically using existing Next.js revalidation/router refresh behavior.
6. If automatic refresh is not reliable in one surface, add an explicit `Refresh status` control.

## Implementation Scope

### Required

1. Add a ticket progress component or small local section on ticket detail.
2. Make pending button states clear for all three current actions:
   - Orchestrator classification
   - Coordinator + Specialist pass
   - QA + Truth review
3. Add or improve automatic refresh after actions complete.
4. Add an explicit refresh control if automatic refresh alone is too subtle.
5. Keep the status logic derived from existing rows:
   - `orchestrator.classified`
   - `coordinator.routed`
   - `specialist.artifact.created`
   - artifact row or artifact packet
   - `qa.validated`
   - `truth.verdict.recorded`
6. Keep RLS and service-role boundaries unchanged.
7. Preserve idempotence from T2/T3/T4.

### Optional If Small

1. Add lightweight polling only while a ticket is not fully complete.
2. Add a small "last updated" timestamp.
3. Add Home activity copy showing that a ticket has internal QA/Truth evidence.

Only take these optional items if they do not add schema, new dependencies, or Realtime/SSE complexity.

## Suggested Technical Direction

Prefer client-side refresh ergonomics over infrastructure:

1. Keep the ticket page as a server-rendered data source.
2. Use client action buttons that call `router.refresh()` after the server action returns, if they do not already do so.
3. If polling is added, scope it to the ticket detail page and stop polling once the full chain exists.
4. Avoid Supabase Realtime in this ticket.
5. Avoid SSE in this ticket.

If a shared component is useful, create something like:

- `app/src/components/tickets/TicketProgressStrip.tsx`

But do not over-abstract. If the logic is only used once, a local section in the ticket page is acceptable.

## Progress Semantics

Use existing facts only:

| Step | Complete When |
|---|---|
| Brief | ticket has `brief_id` or visible brief metadata |
| Orchestrator | `orchestrator.classified` trace exists |
| Coordinator | `coordinator.routed` trace exists |
| Specialist | `specialist.artifact.created` trace exists and artifact evidence exists |
| QA | `qa.validated` trace exists or QA packet exists |
| Truth | `truth.verdict.recorded` trace exists or Truth packet exists |

Do not invent hidden states. If a step cannot be determined from current data, show it as waiting.

## Copy Rules

Keep copy honest and calm:

1. Say `internal review`, not `certified`.
2. Say `recorded evidence`, not `proof`.
3. Say `refresh status`, not `sync live` if no real streaming is present.
4. Do not use `Realtime`, `live stream`, or `SSE` language unless implemented.
5. Do not reintroduce `stub` in rendered user-facing copy.

## Hard Boundaries

1. No schema migration.
2. No new model calls.
3. No connector work.
4. No Supabase Realtime unless explicitly justified and approved.
5. No SSE unless explicitly justified and approved.
6. No broad dashboard redesign.
7. No service-role changes.
8. Do not change ticket state semantics.

## Tests And Validation

Run:

1. `pnpm model:smoke`
2. `pnpm copy:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase db reset`
7. `pnpm exec supabase test db`

If `pnpm exec supabase db reset` is blocked by the auto-mode classifier and no migration changed, report that honestly and run `pnpm exec supabase test db`.

Add tests if practical:

1. Static copy-smoke check for no overclaiming live stream language.
2. Component test for the progress strip if a component is extracted.
3. No RLS tests are required unless schema/policy changes happen. No schema change is expected.

For browser or operator smoke, document exact steps:

1. Create or use a ticket.
2. Run Orchestrator classification.
3. Confirm progress strip updates or refresh control updates it.
4. Run Coordinator/Specialist pass.
5. Confirm artifact step updates.
6. Run QA + Truth review.
7. Confirm QA and Truth steps update.
8. Confirm no duplicate evidence rows from repeated clicks.

## Report Requirements

Write:

`docs/briefs/phase2_t5_live_trace_polling_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. UX behavior added.
4. Whether polling was added or deliberately deferred.
5. Refresh mechanism used.
6. Copy-smoke changes.
7. Validation output with exact pass lines.
8. Any blocked gates, especially `db reset`, with reason.
9. Next recommended ticket, expected to be Phase 2 T6 File Upload + Artifact Viewer unless polling exposes a must-fix gap.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. A live update requires Realtime/SSE to be honest and simple refresh cannot meet the need.
2. The progress strip would need schema changes to avoid guessing.
3. Refresh behavior risks duplicate server actions.
4. UI copy would imply streaming when only refresh/polling exists.
5. The task starts turning into a broader dashboard redesign.
