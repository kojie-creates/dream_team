# CLAUDE BRIEF: Phase 2 T6 File Upload + Artifact Viewer

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Finish Phase 2 by adding the first file-based brief intake and improving artifact viewing.

The current product path supports pasted briefs and deterministic artifact evidence. T6 should let a user upload a small `.txt` or `.md` file as a brief, create the same ticket shape as the paste path, and make artifact evidence easier to inspect.

Do not build a broad document pipeline. PDF extraction, OCR, Drive ingest, connector sync, and storage-heavy workflows are out of scope unless explicitly approved after a blocker is found.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase2_real_agent_loop_claude_brief.md`
3. `docs/briefs/phase2_t5_live_trace_polling_report.md`
4. `docs/briefs/phase1_t2_paste_brief_flow_report.md`
5. `app/src/app/actions/briefs.ts` or the current paste-brief server action file
6. `app/src/components/home/HomeIntro.tsx`
7. `app/src/app/w/[slug]/new/paste/page.tsx`
8. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
9. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`
10. `app/supabase/tests/rls/briefs_tickets.test.sql` or the closest current briefs/tickets RLS test

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[ticketId]`.

## Goal

Add the narrowest useful file flow:

1. User opens a file upload page from the Home upload CTA.
2. User uploads one `.txt` or `.md` file.
3. Server validates type and size.
4. Server reads plain text content.
5. Server creates a `briefs` row with `source='file'`.
6. Server creates a `tickets` row using the same conventions as paste.
7. User is redirected to the ticket detail page.
8. Ticket can continue through T2-T5 actions.
9. Artifact evidence on ticket detail is easier to inspect.

## Expected User Flow

1. User clicks `Upload brief` from the workspace Home.
2. User lands on `/w/[slug]/new/upload`.
3. User chooses a `.txt` or `.md` file.
4. User submits.
5. App creates a brief and ticket.
6. App redirects to `/w/[slug]/tickets/[ticketId]`.
7. User sees source metadata indicating the brief came from a file.
8. User can run Orchestrator, Specialist, QA, and Truth as already implemented.

## Implementation Scope

### Required

1. Add upload route:
   - `/w/[slug]/new/upload`
2. Add an upload form component.
3. Add a server action for file upload brief creation.
4. Reuse paste-flow ticket creation conventions.
5. Accept only:
   - `.txt`
   - `.md`
   - `text/plain`
   - `text/markdown` if browser provides it
6. Add a size limit. Recommended max: 128 KB for Phase 2.
7. Reject empty files.
8. Reject unsupported types with clear copy.
9. Store text in `briefs.raw_text`.
10. Set `briefs.source='file'`.
11. Set `briefs.storage_path=null` unless a storage bucket is explicitly added.
12. Show file/source metadata on ticket detail if already available or easy to add.
13. Improve artifact viewer display for existing T3/T4 artifacts and packets.

### Optional If Small

1. Add `filename` into a safe metadata location if an existing JSON field exists. If no field exists, include it in ticket title or brief-derived title rather than adding schema.
2. Add a small preview of uploaded text before submit if it does not require large client logic.
3. Add `.markdown` extension support.

Only take these optional items if they do not require a migration.

## Storage Decision

Default: do **not** add Supabase Storage in T6.

Reason:

1. `briefs.raw_text` already supports small text/markdown input.
2. `briefs.storage_path` can remain `null`.
3. Storage bucket RLS would add a second security surface.
4. PDF/file storage is better handled in a later ticket with explicit bucket policy tests.

If Claude believes Storage is required, stop and report why. Do not add Storage silently.

## Artifact Viewer Expectations

Improve the ticket detail artifact section without changing schema.

Minimum:

1. Display artifact metadata clearly:
   - kind
   - MIME type
   - bytes
   - created time
2. Display linked artifact packet markdown when present.
3. Make it clear that Phase 2 artifacts are DB-backed packet content, not external files.
4. Do not claim download support unless actual file storage exists.

If helpful, extract a component:

- `app/src/components/tickets/ArtifactViewer.tsx`

But do not over-abstract if the ticket page remains readable.

## Hard Boundaries

1. No PDF extraction in T6.
2. No OCR.
3. No connector ingest.
4. No Supabase Storage unless stopped for approval first.
5. No new model calls.
6. No schema migration unless a critical blocker appears.
7. No service-role writes before RLS-gated authorization.
8. Do not expose service-role keys or file content to logs.
9. Do not accept arbitrary binary files.
10. Do not call uploaded text "parsed" beyond plain text extraction.

## Security And Validation Rules

File validation must happen server-side.

Validate:

1. File exists.
2. File name extension is allowed.
3. MIME type is allowed or safely blank for `.txt`/`.md` browser variance.
4. Size is greater than 0.
5. Size is below the Phase 2 max.
6. Text decode succeeds.
7. Decoded text is non-empty after trim.

Sanitize:

1. Use text content only.
2. Do not render uploaded markdown as trusted HTML.
3. If markdown is shown, render as plain text or controlled markdown, matching current artifact handling.

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

1. Server helper tests for file validation if validation is extracted.
2. Copy-smoke check that upload page does not mention PDF support.
3. Component smoke for artifact viewer if extracted.
4. RLS tests only if schema/policy changes happen. No schema change is expected.

For browser or operator smoke, document exact steps:

1. Open workspace Home.
2. Click `Upload brief`.
3. Upload a small `.txt` file.
4. Confirm ticket detail opens.
5. Confirm brief source shows file.
6. Run Orchestrator.
7. Run Coordinator/Specialist.
8. Run QA/Truth.
9. Confirm artifact viewer renders packet markdown and metadata.

## Report Requirements

Write:

`docs/briefs/phase2_t6_file_upload_artifact_viewer_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Upload route and server action behavior.
4. Accepted/rejected file rules.
5. Whether Storage was used or deferred.
6. Artifact viewer changes.
7. Validation output with exact pass lines.
8. Any blocked gates, especially `db reset`, with reason.
9. Operator acceptance steps.
10. Next recommended action after Phase 2, likely Phase 2 closeout or Phase 3 T1 Navigation + Route Skeleton.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Plain text upload cannot be represented honestly with current `briefs` schema.
2. Upload requires Supabase Storage to avoid data loss or misrepresentation.
3. File validation cannot be enforced server-side.
4. Artifact viewer requires a schema change to avoid misleading the user.
5. The task starts turning into a general document ingestion system.
