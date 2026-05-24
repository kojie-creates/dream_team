# CLAUDE BRIEF: Phase 1 T2 Paste Brief Flow

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Build the first real Phase 1 product flow:

Authenticated workspace member pastes a brief, the app writes a `briefs` row plus an initial `tickets` row, then redirects to a ticket detail page.

Keep this small. No model call, no upload, no generated chat, no orchestrator stub, no trace writes yet.

## Current State

Already complete:

1. Phase 0 auth, onboarding, workspace frame, invite flow, empty Home.
2. Phase 1 T1 database foundation.
3. Cloud `dream-team-dev` has tables: `briefs`, `tickets`, `workflow_runs`, `trace_events`, `packets`, `artifacts`.
4. RLS allows authenticated workspace members to insert `briefs` and `tickets`.
5. `trace_events` is append-only and has no direct client insert policy.

## Source Files To Read First

Read these files before editing:

1. `app/AGENTS.md`
2. `docs/design/dream_team_v1_architecture_brief.md`
3. `docs/design/dream_team_first_run_ux_brief.md`
4. `docs/briefs/phase1_t1_database_foundation_report.md`
5. `app/src/app/w/[slug]/layout.tsx`
6. `app/src/app/w/[slug]/page.tsx`
7. `app/src/components/home/HomeIntro.tsx`
8. `app/src/lib/workspace/list.ts`
9. `app/src/app/actions/onboarding.ts`
10. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each read, echo the first 3 non-empty lines.

## Hard Scope

In scope:

1. Add a paste-brief route under the workspace, recommended: `app/src/app/w/[slug]/new/paste/page.tsx`
2. Add a server action for paste submission, recommended: `app/src/app/actions/briefs.ts`
3. Add small component(s) if helpful, recommended under `app/src/components/briefs/`
4. Add a ticket detail route, recommended: `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
5. Update Home CTA so "Upload a brief" becomes a working paste-entry button or add a separate "Paste a brief" CTA.
6. Add focused tests if the current app test setup supports them. If no test framework exists for app components/actions yet, document that honestly and validate through typecheck, lint, and browser/cloud smoke.
7. Write final report: `docs/briefs/phase1_t2_paste_brief_flow_report.md`

Out of scope:

1. No file upload.
2. No PDF parsing.
3. No "Generate with chat".
4. No Anthropic/model API.
5. No Edge Functions.
6. No Realtime/SSE.
7. No writes to `workflow_runs`, `trace_events`, `packets`, or `artifacts`.
8. No schema migration unless a blocker proves one is required. If schema change is needed, stop and report.
9. No connector work.

## UX Shape

Keep the UI quiet and consistent with the existing dark workspace shell.

Paste page:

1. Route: `/w/[slug]/new/paste`
2. Heading: `Paste a brief`
3. Textarea label: `Brief text`
4. Optional title field: `Title`
5. Submit button: `Create ticket`
6. Show inline validation errors.
7. Brief text minimum: 20 characters.
8. Brief text maximum: 10,000 characters for now.
9. If title is blank, generate a short fallback title from the first meaningful line of the brief.

Ticket detail page:

1. Route: `/w/[slug]/tickets/[ticketId]`
2. Show ticket title.
3. Show status, layer/current agent if present.
4. Show source brief text or a preview.
5. Show a trace section with an honest empty state: `Trace events will appear after the Orchestrator runs.`
6. Do not imply orchestration has run.

Home:

1. Make the primary Phase 1 CTA lead to `/w/[slug]/new/paste`.
2. Keep upload/generate visibly deferred if they remain on screen.
3. Do not create a marketing hero. Keep the existing work-surface feel.

## Data Rules

Use the authenticated server Supabase client first:

1. `createSupabaseServerClient()`
2. RLS should prove membership and row access.
3. Do not use service-role for the paste action unless a validated RLS bug blocks the path. If that happens, stop and report before changing approach.

Submission flow:

1. Resolve workspace by `slug` through RLS.
2. Get current authenticated user.
3. Insert `briefs`:
   - `workspace_id`
   - `source = 'paste'`
   - `raw_text`
   - `word_count`
   - `parsed_status = 'ready'`
   - `created_by = user.id`
4. Insert `tickets`:
   - `workspace_id`
   - `brief_id`
   - `title`
   - `status = 'open'`
   - `layer = null`
   - `current_agent = 'central-orchestrator'` or `null`
   - `created_by = user.id`
5. Redirect to `/w/[slug]/tickets/[ticketId]`.

Important:

1. The ticket id route param should use the UUID `tickets.id`, not `wq_id`.
2. Do not write `wq_id` unless a simple local convention already exists. It can remain null for now.
3. The ticket detail read must be workspace-scoped and RLS-gated.
4. A foreign workspace/ticket should 404, not leak existence.

## Validation Requirements

Run:

1. `pnpm verify:supabase-project`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm exec supabase db reset`
5. `pnpm exec supabase test db`

Browser/cloud smoke:

1. Use the local dev app pointing at `dream-team-dev`.
2. Sign in as the existing smoke user or create a new confirmed smoke user if needed.
3. Open an existing workspace.
4. Click the paste-brief CTA.
5. Submit a valid pasted brief.
6. Confirm redirect to `/w/<slug>/tickets/<ticketId>`.
7. Confirm ticket detail shows the title and brief preview.
8. Confirm database readback shows one matching `briefs` row and one matching `tickets` row.

Do not print secret env values.

## Required Readback After Each Write

After writing or editing each file, immediately read it back and echo:

1. Path
2. Line count
3. First 3 non-empty lines

This applies to:

1. Server action files
2. Page files
3. Component files
4. Report file
5. Any tests

## Expected Files

Likely files to create:

1. `app/src/app/actions/briefs.ts`
2. `app/src/app/w/[slug]/new/paste/page.tsx`
3. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
4. Optional: `app/src/components/briefs/PasteBriefForm.tsx`
5. `docs/briefs/phase1_t2_paste_brief_flow_report.md`

Likely files to modify:

1. `app/src/components/home/HomeIntro.tsx`
2. Possibly `app/src/app/w/[slug]/page.tsx` if needed to pass `slug` to `HomeIntro`.

## Stop Conditions

Stop and report if:

1. RLS blocks `briefs` or `tickets` insert for a legitimate workspace member.
2. A schema change seems necessary.
3. You need service-role to make the basic paste flow work.
4. Existing local Supabase tests fail before your UI/server-action changes are involved.
5. The flow requires writing `trace_events`, `packets`, or `workflow_runs`.
6. Any cloud command would mutate schema unexpectedly.

## Final Report Must Include

Write `docs/briefs/phase1_t2_paste_brief_flow_report.md` with:

1. Completion status: `complete`, `blocked`, or `partial`
2. Files changed
3. Routes added
4. Data writes performed by the flow
5. Exact validation command outputs
6. Browser/cloud smoke summary
7. Database readback summary
8. Confirmation that no schema migration was added
9. Confirmation that no service-role path was used for user paste submission
10. Known caveats and next recommended ticket

## Next Ticket After This

If this ticket completes, the next likely ticket is:

Phase 1 T3: Orchestrator stub round-trip, using a server/service-role path to write `workflow_runs`, `trace_events`, and `packets` for an existing open ticket. That is not part of this ticket.
