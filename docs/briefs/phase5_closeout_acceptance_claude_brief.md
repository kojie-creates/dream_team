# CLAUDE BRIEF: Phase 5 Closeout Acceptance

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Close Phase 5 with an honest acceptance report across connector schema, connector settings, Google Calendar OAuth, read-only ingest, manual automation, and the controlled write path.

This is report-only unless a blocking verification gap is found.

## Operating Mode

This is a phase closeout brief.

Do not make app code changes unless a verification command proves a small documentation-only correction is necessary. If code changes appear necessary, stop and report the gap instead of widening scope.

After writing the report, immediately read it back and echo the first 3 non-empty lines and the line count.

## Source Files To Read First

Read these reports:

1. `docs/briefs/phase5_t1_connector_schema_rls_report.md`
2. `docs/briefs/phase5_t2_connector_settings_surface_report.md`
3. `docs/briefs/phase5_t3_google_calendar_oauth_skeleton_report.md`
4. `docs/briefs/phase5_t4_calendar_readonly_ingest_report.md`
5. `docs/briefs/phase5_t5_automation_rules_report.md`
6. `docs/briefs/phase5_t6_controlled_tool_write_path_report.md`

After each read, echo the first 3 non-empty lines.

Also read:

1. `docs/design/dream_team_v1_architecture_brief.md`
2. `docs/briefs/phase5_connectors_automation_claude_brief.md`
3. `app/src/app/w/[slug]/settings/connectors/page.tsx`, if present
4. `app/src/app/w/[slug]/settings/automations/page.tsx`, if present

Use `Get-Content -LiteralPath` for dynamic route paths.

## Acceptance Questions

Answer these in the report:

1. Does OAuth round-trip work for one provider?
2. Which provider works?
3. Which scopes are requested?
4. Where is token material stored?
5. Can browser clients read token material?
6. Can one external item become a brief/ticket?
7. Is there a manual automation rule path?
8. Is any background scheduling enabled?
9. Is there a controlled external write path?
10. Does the external write require explicit user confirmation?
11. What is still non-production or pending provider dashboard setup?

## Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase db reset`
7. `pnpm exec supabase test db`

Operator acceptance checklist:

1. Open `/w/<slug>/settings/connectors`.
2. Confirm Google Calendar card reflects the actual connection state.
3. Complete OAuth if not already connected.
4. Open Google Calendar connector detail page.
5. Preview an event.
6. Create a brief/ticket from the event.
7. Open Automations page.
8. Create and manually run a Calendar ingest rule.
9. Open a ticket and create one calendar hold, if write scope is configured.
10. Confirm trace/packet evidence appears for the write.

If a provider dashboard credential or Google consent setup blocks any operator step, mark that specific step `operator-pending`; do not convert it into pass.

## Report Requirements

Write:

`docs/briefs/phase5_acceptance_report.md`

Report sections:

1. Summary verdict.
2. Phase scope recap.
3. Ticket-by-ticket table T1 through T6.
4. Automated gate output.
5. Operator walkthrough checklist.
6. Supabase/RLS/token boundary summary.
7. Supported claims.
8. Explicit non-claims.
9. Security caveats.
10. Recommended Phase 6 or hardening work.

Supported claims should be narrow and evidence-backed. Examples:

1. `Dream Team can store workspace-scoped connector status.`
2. `Dream Team can connect one Google Calendar account when provider credentials are configured.`
3. `Dream Team can create a brief/ticket from a user-confirmed calendar event.`
4. `Dream Team can create a user-confirmed calendar hold when write scope is configured.`

Non-claims should include anything not implemented:

1. No Gmail send.
2. No Slack/Notion/Drive production ingest unless actually built.
3. No autonomous background scheduler unless actually built.
4. No production billing.
5. No enterprise connector compliance certification.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final verdict line

## Stop Conditions

Stop and report blocked if:

1. Any previous Phase 5 report is missing.
2. Token boundary evidence is unclear.
3. Automated gates fail.
4. The report would need to claim OAuth or tool-write success without operator evidence.
