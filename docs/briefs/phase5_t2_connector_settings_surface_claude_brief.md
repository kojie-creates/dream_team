# CLAUDE BRIEF: Phase 5 T2 Connector Settings Surface

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Add a workspace Settings page that displays connector status and prepares the OAuth entry point without exchanging tokens yet.

This ticket should make the connector model visible and honest. The UI may show `Connect` buttons, but provider OAuth should remain disabled unless Phase 5 T3 is being executed.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For markdown reports, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase5_t1_connector_schema_rls_report.md`
3. `app/src/app/w/[slug]/settings/page.tsx`
4. `app/src/app/w/[slug]/settings/members/page.tsx`
5. `app/src/components/workspace/WorkspaceFrame.tsx`
6. `app/src/lib/supabase/server.ts`
7. `app/src/lib/workspace/list.ts`
8. `app/supabase/migrations/0006_phase5_connectors.sql`

After each read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]`.

## Goal

Create:

`/w/[slug]/settings/connectors`

The page must:

1. Read connector metadata through the RLS-gated session client.
2. Show provider cards.
3. Show exact status from the database where a row exists.
4. Show `Not connected` when no row exists.
5. Show scopes in plain language.
6. Show security caveats: tokens are server-side only; Phase 5 starts read-only.
7. Link from the Settings landing page.

## Provider Order

Render these cards in this order:

1. Google Calendar
2. Google Drive
3. Gmail
4. Google Sheets
5. Slack
6. Notion

Google Calendar is the first intended OAuth provider because it can prove read-only tool access without starting with email write permissions.

## UI Behavior

Settings connectors page:

1. Header:
   - breadcrumb back to Settings
   - title `Connectors`
   - subtitle `Connect external tools after you review scopes and boundaries.`
2. Security note:
   - `Tokens are stored server-side only. Browser clients can see connector status, not token material.`
3. Provider cards:
   - provider name
   - current status
   - scopes requested or planned
   - last sync if present
   - last error if present
   - action area

Action area for T2:

1. Google Calendar: show disabled `Connect in T3` button or link target placeholder.
2. All other providers: disabled `Later` button.

Do not create OAuth routes in T2.

## Data Query

In the page server component:

1. Resolve workspace by slug using the existing RLS-gated pattern.
2. Query `connectors` for the current workspace.
3. Map rows by provider.

No service-role read.

## Files Likely To Create Or Modify

Likely create:

1. `app/src/app/w/[slug]/settings/connectors/page.tsx`
2. `app/src/components/connectors/ConnectorCard.tsx`
3. `app/src/lib/connectors/catalog.ts`

Likely modify:

1. `app/src/app/w/[slug]/settings/page.tsx`
2. `app/scripts/copy-smoke.mjs`

Keep component count reasonable. If `ConnectorCard` stays small, one component file is enough.

## Hard Boundaries

1. No OAuth routes.
2. No token exchange.
3. No provider API calls.
4. No service-role.
5. No schema migration unless T1 was incomplete.
6. Do not claim a provider is connected unless the database row says `connected`.
7. Do not imply Gmail, Slack, Drive, or Notion are live.

## Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Unauth route probe:

1. `/w/probe/settings/connectors` should redirect to `/signin`.

Browser/operator smoke:

1. Open `/w/<slug>/settings`.
2. Click Connectors.
3. Confirm six provider cards render.
4. Confirm Google Calendar is marked as first planned provider.
5. Confirm all actions are honest and disabled or non-exchanging.
6. Confirm token boundary copy appears.

## Report Requirements

Write:

`docs/briefs/phase5_t2_connector_settings_surface_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Route added.
4. Data queried.
5. Provider cards and action states.
6. Security copy.
7. Validation output with exact pass lines.
8. Operator acceptance notes.
9. Next recommended ticket: Phase 5 T3 Google Calendar OAuth Skeleton.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. The connector table from T1 is missing or unsafe.
2. Rendering requires service-role access.
3. UI copy would imply a provider is already live.
4. OAuth work starts inside this ticket.
