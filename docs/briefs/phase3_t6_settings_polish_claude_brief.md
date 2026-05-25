# CLAUDE BRIEF: Phase 3 T6 Settings Polish

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Finish Phase 3 by making Settings and Members feel usable enough for a demo.

Phase 3 now has navigation, agents, agent detail, contracts, and history. T6 should polish the Settings area around existing workspace/member/invite data.

This ticket is not billing, connector setup, token budgets, or account administration. Keep it to workspace settings and members/invites already present in Phase 0.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Dirty Worktree Warning

Before editing, inspect `git status --short`.

At the time this brief was created, these files were modified but are not part of Phase 3 T6:

1. `app/src/app/(auth)/layout.tsx`
2. `app/src/app/globals.css`
3. `app/src/app/layout.tsx`

Do not stage, revert, or modify those files unless Felix explicitly says they belong to T6. Treat them as unrelated local changes.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase3_workspace_operating_surface_claude_brief.md`
3. `docs/briefs/phase3_t5_history_page_report.md`
4. `app/src/app/w/[slug]/settings/page.tsx`
5. `app/src/app/w/[slug]/settings/members/page.tsx`
6. `app/src/components/invites/InviteForm.tsx`
7. `app/src/app/actions/invites.ts`
8. `app/supabase/migrations/0001_phase0_foundation.sql`
9. `app/supabase/migrations/0002_phase0_rls.sql`
10. `app/supabase/migrations/0004_phase0_invite_create_rpc.sql`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]`.

## Goal

Improve:

1. `/w/[slug]/settings`
2. `/w/[slug]/settings/members`

The result should let an owner/admin inspect workspace basics, member/invite state, and the dev-safe invite flow without confusion.

## Implementation Scope

### Required

1. Settings landing should show:
   - workspace name
   - slug
   - plan if available
   - created date if available
   - clear links/cards for Members and future areas
2. Members page should show:
   - current members list from `workspace_members`
   - role
   - joined date if available
   - pending/recent invites
   - invite form
3. Keep invite email caveat honest:
   - Phase 0/3 uses dev-safe console/log + inline URL behavior.
   - Do not imply production email is configured.
4. Preserve RLS:
   - normal member reads through session client.
   - invites remain visible only where existing RLS permits.
5. Keep empty states helpful and honest.

### Optional If Small

1. Add small role badges.
2. Add accepted/expired/pending invite counts.
3. Add a "copy invite URL" UI only if existing state already exposes the URL after invite creation.

Only take optional items if they do not add dependencies or schema changes.

## Suggested Data Queries

Settings landing:

1. `workspaces`: `id, name, slug, plan, created_at`
2. `workspace_members`: count for current workspace
3. `workspace_invites`: count if RLS permits

Members page:

1. `workspace_members`: `workspace_id, user_id, role, joined_at`
2. `users_profile`: if joinable through current schema/RLS, display names. If not, show user IDs truncated.
3. `workspace_invites`: `email, role, expires_at, accepted_at, created_at`

Do not use service-role to make the UI prettier.

## UI Expectations

Use the existing dark operator style.

Settings landing:

1. Header with workspace name.
2. Small metadata cards.
3. Section cards:
   - Members: live
   - Workspace profile: read-only for now
   - Billing: not part of Phase 3
   - Connectors: Phase 5

Members page:

1. Header with back link to Settings.
2. Current members section.
3. Invite form section.
4. Pending/recent invites section.
5. Clear dev-email caveat near invite form.

Avoid marketing hero sections. Keep it operational.

## Hard Boundaries

1. No schema migrations.
2. No model calls.
3. No connector/OAuth work.
4. No billing implementation.
5. No token budget implementation.
6. No service-role UI reads.
7. No production email provider setup.
8. No destructive member management.
9. Do not touch unrelated root/auth/style files noted in Dirty Worktree Warning.

## Tests And Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Run browser or curl smoke:

1. `/w/<slug>/settings` renders for signed-in user.
2. `/w/<slug>/settings/members` renders for signed-in user.
3. Settings nav item is active on both pages.
4. Members list appears.
5. Invite form still renders.
6. Unauthenticated settings routes redirect to `/signin`.

No `supabase db reset` is required unless schema changes happen. No schema change is expected.

## Report Requirements

Write:

`docs/briefs/phase3_t6_settings_polish_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Data sources queried.
4. Settings landing behavior.
5. Members page behavior.
6. Invite caveats.
7. Browser/curl smoke results.
8. Validation output with exact pass lines.
9. Confirmation that unrelated dirty files were not staged or modified.
10. Next recommended step: Phase 3 closeout acceptance.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Member display requires service-role reads.
2. RLS hides data needed for an honest UI and no safe session-client query exists.
3. The task starts turning into billing, connectors, or destructive user management.
4. Unrelated dirty files need to be changed to complete T6.
