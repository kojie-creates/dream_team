# CLAUDE BRIEF: Phase 5 Connectors And Automation

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Connect Dream Team to outside productivity tools and begin automation.

Phase 5 should make external work become briefs/tickets:

1. Gmail.
2. Calendar.
3. Drive or Docs/Sheets.
4. Slack or Notion later.
5. Scheduled/daily brief automation.

This phase must be security-first. OAuth tokens, scoped permissions, and user consent are the main risk.

## Operating Mode

This is a phase-level brief, not permission to implement the whole phase in one pass.

Start each ticket by narrowing scope, naming files, and confirming validation. After every file write, immediately read back the changed file enough to prove it exists and contains the intended section. For new markdown reports, echo the first 3 non-empty lines and the line count.

## Phase 5 Exit Criteria

OAuth round-trip works for one provider, the app can ingest one external item as a brief, and an agent/adapter can read or write through a controlled server-side path.

## Source Files To Read First

Read:

1. `docs/design/dream_team_v1_architecture_brief.md`
2. `docs/briefs/phase1_t6_acceptance_pass_report.md`
3. Latest Phase 2, Phase 3, and Phase 4 reports, if present.
4. `app/src/lib/supabase/server.ts`
5. `app/src/lib/supabase/service.ts`
6. `app/src/app/w/[slug]/settings/members/page.tsx`
7. Existing auth callback route under `app/src/app/auth/callback/route.ts`

After each read, echo the first 3 non-empty lines.

## Recommended Ticket Sequence

### Phase 5 T1: Connector Schema And RLS

Goal: add connector metadata without storing raw tokens in exposed tables.

Scope:

1. Add `connectors`.
2. Add `connector_tokens` only if storage strategy is explicit.
3. Prefer private schema or locked-down access for tokens.
4. RLS tests required.

Exit:

1. Workspace can list connector status.
2. No raw token is readable by client roles.

### Phase 5 T2: OAuth Skeleton For One Provider

Goal: complete OAuth connect/disconnect for one low-risk provider.

Recommended first provider:

1. Google Calendar or Google Drive metadata read.
2. Avoid Gmail write permissions as first step.

Scope:

1. OAuth start route.
2. OAuth callback route.
3. Store connector status.
4. Store token only in approved server-only/private path.

Exit:

1. User can connect and disconnect one provider.

### Phase 5 T3: Read-Only Ingest

Goal: ingest one external item into a `briefs` row.

Scope:

1. Choose one provider item type.
2. Show preview before creating a brief if possible.
3. Create `briefs` and `tickets` through existing Phase 1 path.

Exit:

1. External item becomes a brief/ticket.

### Phase 5 T4: Automation Rules

Goal: simple user-controlled automation.

Scope:

1. "Create a daily brief from selected source" or similar.
2. No broad autonomous actions without review.
3. Add scheduler only after manual path works.

Exit:

1. One automation can run and create a traceable brief/ticket.

### Phase 5 T5: Tool Write Path

Goal: controlled outbound action, such as draft email or calendar hold.

Scope:

1. Draft first, do not send by default.
2. Require user confirmation for external writes.
3. Record trace/packet evidence.

Exit:

1. Tool output is visible, reviewable, and not silently sent.

## Hard Boundaries

1. Never expose OAuth tokens to client code.
2. Never store raw tokens in a table readable by `anon` or `authenticated`.
3. Start read-only before write scopes.
4. Confirm before external writes.
5. Do not request broad scopes without a written reason.
6. Do not build connector automation before manual connect/read is stable.

## Security Requirements

For any connector schema:

1. RLS tests for workspace isolation.
2. Token access tests showing client roles cannot read token material.
3. Server-only helper for provider calls.
4. Explicit scope list in UI.
5. Disconnect path that invalidates local token state.

For any external write:

1. User sees exactly what will be sent/changed.
2. User confirms.
3. The action is logged as a trace event/packet.

## Validation Stack

Every ticket:

1. `pnpm verify:supabase-project`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm exec supabase db reset`
5. `pnpm exec supabase test db`
6. Browser smoke for connect/read/write path as applicable.

OAuth tickets must also include:

1. Redirect URI list.
2. Provider scopes.
3. Token storage boundary.
4. Manual revocation/reconnect test where possible.

## Reports

Reports must include:

1. Provider and scopes.
2. Token storage boundary.
3. Data ingested or written.
4. User confirmation behavior.
5. Validation output.
6. Caveats and security notes.

## Stop Conditions

Stop if:

1. A token would be exposed to client code.
2. A write action could happen without explicit confirmation.
3. OAuth provider setup requires a dashboard decision from Felix.
4. The requested scope is broader than the demonstrated feature.
5. Connector schema needs encryption design that has not been approved.
