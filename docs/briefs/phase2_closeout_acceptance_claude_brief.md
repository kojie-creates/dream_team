# CLAUDE BRIEF: Phase 2 Closeout Acceptance

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Close Phase 2 honestly before Phase 3 begins.

Phase 2 has added the first real agent loop pieces:

1. Model provider boundary.
2. Real Orchestrator classification.
3. Coordinator + Specialist deterministic artifact.
4. QA + Truth Agent internal evidence.
5. Ticket progress strip + polling/refresh UX.
6. `.txt` / `.md` upload path + clearer artifact viewer.

This ticket is an acceptance and reporting pass. Do not add product features unless a small bug fix is required to make the acceptance path truthful.

## Operating Mode

This is a closeout verification brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For the final markdown report, echo the first 3 non-empty lines and the line count.

If a gate is blocked by the auto-mode classifier, report it plainly and continue with the closest non-destructive evidence.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase2_real_agent_loop_claude_brief.md`
3. `docs/briefs/phase2_t1_model_provider_boundary_report.md`
4. `docs/briefs/phase2_t2_real_orchestrator_classification_report.md`
5. `docs/briefs/phase2_t3_coordinator_specialist_artifact_report.md`
6. `docs/briefs/phase2_t4_qa_truth_evidence_report.md`
7. `docs/briefs/phase2_t5_live_trace_polling_report.md`
8. `docs/briefs/phase2_t6_file_upload_artifact_viewer_report.md`
9. `docs/demo/phase1_demo_script.md`
10. `app/src/app/actions/orchestration.ts`
11. `app/src/app/actions/briefs.ts`
12. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[ticketId]`.

## Goal

Produce a Phase 2 acceptance report that answers:

1. What works now?
2. What was verified by automated gates?
3. What still requires Felix/operator acceptance?
4. What does Phase 2 explicitly not claim?
5. What should Phase 3 start with?

## Required Verification

Run these gates from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase db reset`
7. `pnpm exec supabase test db`

If `pnpm exec supabase db reset` is blocked by the auto-mode classifier, do not bypass. Report it as blocked, note whether migrations changed in Phase 2, and run `pnpm exec supabase test db`.

## Manual / Operator Acceptance Script

Write an operator script inside the report for Felix to walk in the browser.

Minimum script:

1. Sign in to local app.
2. Open workspace Home.
3. Paste a brief.
4. Open the created ticket.
5. Run Orchestrator classification.
6. Run Coordinator + Specialist pass.
7. Run QA + Truth review.
8. Confirm progress strip reaches Truth.
9. Confirm artifact viewer shows metadata and packet content.
10. Return Home and confirm recent activity reflects the work.
11. Open Upload brief.
12. Upload a small `.txt` or `.md` file.
13. Confirm a file-sourced ticket is created.
14. Run the minimal agent loop on the uploaded ticket if Felix wants full acceptance.

Do not claim this script was completed unless Felix explicitly reports it.

## Data Readback

If a concrete test ticket is available from the operator or current browser, include a DB readback:

1. ticket title
2. ticket status
3. brief source
4. trace event count
5. packet count
6. artifact count
7. latest event type

Use a read-only query path. Do not mutate data for readback.

If no concrete ticket ID is available, include the query template and mark operator readback pending.

## Acceptance Report

Write:

`docs/briefs/phase2_acceptance_report.md`

Report sections:

1. Completion status.
2. Phase 2 scope recap.
3. T1-T6 summary table.
4. Automated gates and exact pass lines.
5. Manual operator script.
6. Optional DB readback or readback template.
7. Claims Phase 2 supports.
8. Claims Phase 2 does not support.
9. Security and honesty boundaries.
10. Known caveats.
11. Recommended next step: Phase 3 T1 Navigation + Route Skeleton.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Claims Phase 2 May Support

Use careful wording:

1. `Dream Team can run a bounded first-pass agent workflow from a brief.`
2. `The workflow records trace events, packets, workflow runs, and artifact metadata.`
3. `The Orchestrator classification can use a server-side Anthropic model call when configured.`
4. `Coordinator, Specialist, QA, and Truth steps are deterministic internal workflow evidence in Phase 2.`
5. `Small text/markdown file briefs can enter the same ticket loop.`

## Claims Phase 2 Must Not Make

Do not claim:

1. External attestation.
2. Certification.
3. Regulator-grade audit.
4. Realtime/SSE/WebSocket streaming.
5. Supabase Storage-backed file management.
6. PDF/OCR/DOCX processing.
7. Connector automation.
8. Autonomous external tool use.
9. Production billing-grade cost enforcement.

## Hard Boundaries

1. Do not add features during closeout.
2. Do not introduce schema migrations during closeout.
3. Do not run destructive bypasses.
4. Do not mutate tickets or briefs unless a user-provided operator acceptance step explicitly requires it.
5. Do not print API keys.
6. Do not overstate manual acceptance.

## Stop Conditions

Stop and report blocked if:

1. Automated gates fail and the failure is not clearly unrelated.
2. The reports contradict code behavior.
3. Phase 2 claims cannot be supported by current evidence.
4. Acceptance requires a live model call and no operator approval/key mode is available.
