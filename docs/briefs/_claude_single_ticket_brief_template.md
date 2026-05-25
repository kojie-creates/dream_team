# CLAUDE BRIEF: [Phase/Ticket Name]

Date: [YYYY-MM-DD]
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

[One short paragraph explaining what this ticket builds and why it matters.]

[One short paragraph naming the boundary. Be explicit about what this does not do.]

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For markdown reports, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `[relevant prior phase report]`
3. `[relevant current feature report or brief]`
4. `[primary route or action file]`
5. `[primary component file]`
6. `[relevant migration or schema file]`
7. `[relevant test file]`

After each read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]`, `[ticketId]`, or other bracketed segments.

## Goal

[State the concrete end state in 3-7 bullets.]

1. [Goal item]
2. [Goal item]
3. [Goal item]

## Scope

Implement only:

1. [Specific item]
2. [Specific item]
3. [Specific item]

Do not implement:

1. [Out-of-scope item]
2. [Out-of-scope item]
3. [Out-of-scope item]

## Data / Schema Requirements

[Use this section only when schema changes are required. Otherwise write: `No schema migration expected.`]

Migration path:

`app/supabase/migrations/[next_number]_[short_name].sql`

Required tables, columns, constraints, policies, and tests:

1. [Requirement]
2. [Requirement]
3. [Requirement]

## UI Expectations

[Describe the expected user-facing route or component.]

The UI should show:

1. [Visible element]
2. [Visible element]
3. [Visible element]

The UI must honestly label:

1. [Caveat or non-claim]
2. [Caveat or non-claim]

## Server / Action Requirements

[Describe server actions, route handlers, provider helpers, or RLS/security ordering.]

Required order for privileged operations:

1. Authenticate user.
2. Verify workspace membership through RLS-gated session read.
3. Verify target row belongs to workspace.
4. Use service-role only if unavoidable and only after authorization.
5. Write trace/evidence where applicable.

## Evidence Requirements

[Describe packets, trace events, reports, or readbacks required.]

Evidence must be append-only unless this ticket explicitly authorizes mutation.

Do not fabricate workflow runs, packets, external attestations, browser passes, provider calls, or operator acceptance.

## Hard Boundaries

1. No unrelated refactors.
2. No new feature beyond the ticket goal.
3. No weakening RLS.
4. No service-role before RLS-gated authorization.
5. No external provider call unless explicitly in scope.
6. No user-facing overclaim.
7. No Orin Supabase project reference.
8. Do not use the forbidden project ref `fwexgqktxdfiajpqlgvz`.

## Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Run `pnpm exec supabase db reset` only when this ticket adds or changes migrations.

Operator/browser smoke:

1. [Step]
2. [Step]
3. [Step]

If operator acceptance is pending, say so plainly and include exact steps.

## Report Requirements

Write:

`docs/briefs/[phase_ticket_name]_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Scope implemented.
4. Scope not implemented.
5. Data/schema behavior.
6. UI behavior.
7. Security/RLS behavior.
8. Validation output with exact pass lines.
9. Operator acceptance result or pending steps.
10. Next recommended ticket.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. The ticket requires a broader architectural decision.
2. RLS or token boundaries become unclear.
3. The implementation would need to fabricate evidence.
4. Validation fails and the fix would exceed this ticket's scope.
5. The implementation would touch unrelated surfaces.
