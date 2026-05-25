# Phase 4 T2 Failure Injector — Report

**Date:** 2026-05-24
**Status:** Complete

## Completion status

Implemented a controlled failure injector that marks an eligible ticket as
`failed` and writes one honest evidence chain (workflow_run + trace_event +
failure packet + ticket update). The T1 Failure Evidence panel renders the
result. No retry, resolve, or reroute behavior added. No schema migration.

## Files changed

- `app/src/app/actions/orchestration.ts` — added `injectControlledFailure`
  server action.
- `app/src/components/tickets/InjectControlledFailureButton.tsx` — new client
  component for the failure-test panel.
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` — wired the
  `Failure test` section behind `canInjectFailure` eligibility check.
- `app/scripts/copy-smoke.mjs` — added the new component to the no-`stub`
  scan, plus a Phase 4 T2 check that the injector copy never promises
  retry/resolve/reroute/rerun without an explicit negation.

## Eligibility rules

The `Failure test` section appears when **all** of the following hold:

1. User session present (RLS, server client).
2. Workspace resolves by slug under the session client.
3. Ticket resolves by id within that workspace under the session client.
4. `ticket.status` is `open` or `in_progress`.
5. No `packets` row with `packet_type = 'failure'` exists for this ticket.

Tickets in `done`, `failed`, `looped`, or `needs_input` are not eligible.
Completed (`done`) tickets are explicitly excluded — failure cannot be
injected on an accepted-and-completed ticket.

## Server action write order

`injectControlledFailure` (`src/app/actions/orchestration.ts`):

1. **RLS-gated reads** via `createSupabaseServerClient()`:
   - `auth.getUser()` (redirects to `/signin` if absent),
   - `workspaces` lookup by slug,
   - `tickets` lookup by id + workspace_id,
   - status eligibility guard,
   - existing `packets` failure check (idempotence pre-check).
2. **Service-role acquired** only after the RLS-gated reads succeed.
3. **Service-side race guard**: re-checks `packets` for an existing failure
   row under service role.
4. **workflow_runs** insert: `run_kind='specialist'`,
   `agent_id='failure-injector'`, `model='deterministic/injector'`,
   `status='failed'`.
5. **trace_events** insert: `seq = max(seq) + 1`,
   `event_type='failure.injected'`,
   `from_agent='failure-injector'`,
   `to_agent='central-orchestrator'`.
6. **packets** insert: `packet_type='failure'`, linked to the trace event
   via `trace_event_id`.
7. **tickets** update: `status='failed'`,
   `failure_type='execution_error'`,
   `current_agent='failure-injector'`.
8. `revalidatePath` for the ticket detail route, return `{ error: null }`.

## Failure packet shape

`body_parsed` (jsonb):

```json
{
  "packet_kind": "failure",
  "from": "failure-injector",
  "to": "central-orchestrator",
  "failure_type": "execution_error",
  "detail": "Controlled Phase 4 T2 failure injected for UI and evidence testing.",
  "state_at_failure": "No external tool call was attempted. This failure was created by an explicit operator test action.",
  "recovery_suggestion": "stop",
  "phase": "phase4_t2",
  "tool_use": false,
  "controlled_test": true
}
```

`body_raw`:

```text
FAILURE PACKET
From: failure-injector
To: central-orchestrator
Work item: <ticket id>
Failure type: execution_error
Detail: Controlled Phase 4 T2 failure injected for UI and evidence testing.
State at failure: No external tool call was attempted. This failure was created by an explicit operator test action.
Recovery suggestion: stop
```

Failure type is drawn from the closed taxonomy in
`contracts/failure-packet-contract.md` (`execution_error`). The text makes the
controlled-test nature explicit.

## Trace event shape

- `event_type`: `failure.injected`
- `seq`: `max(existing seq) + 1`
- `from_agent`: `failure-injector`
- `to_agent`: `central-orchestrator`
- `payload`:
  ```json
  {
    "failure_type": "execution_error",
    "detail": "Controlled Phase 4 T2 failure injected for UI and evidence testing.",
    "controlled_test": true,
    "tool_use": false,
    "phase": "phase4_t2"
  }
  ```

## Idempotence behavior

Two layers of guard:

1. **RLS-side pre-check** before acquiring the service-role client. If a
   `packets` row with `packet_type='failure'` already exists for the ticket,
   the action revalidates the page and returns `{ error: null }` without any
   writes.
2. **Service-side race re-check** immediately after acquiring the
   service-role client and before the first write. Same behavior: no-op,
   revalidate, return.

Re-clicking the button on a failed ticket is a no-op. Eligibility also hides
the button once a failure packet exists, so the second-click path is itself
unreachable from the UI under normal conditions.

## UI behavior

- `Failure test` section appears on the ticket detail page only when
  `canInjectFailure` is true (see eligibility rules).
- Section title: `Failure test`. Body copy explicitly labels the action as a
  demo/test and states `no recovery is wired yet`.
- Button: `Inject controlled failure`. Pending label: `Writing failure…`.
- After a successful injection the page revalidates and renders:
  - `StatusPill` showing `failed`,
  - `failure_type: execution_error` chip in the header,
  - the existing `FailureEvidencePanel` (T1) with the new failure packet
    card (failure type chip, detail, recovery suggestion, from/to, linked
    trace, expandable raw body),
  - a trace row of type `failure.injected` in the trace list.
- Other action panels (`Orchestrator`, `Coordinator + Specialist`,
  `QA + Truth Review`) hide automatically because their `can*` flags require
  `status` of `open` / `in_progress` / `done`, none of which include
  `failed`.

## Validation output

Run from `app/`:

```
$ pnpm copy:smoke
copy-smoke: OK (25 checks)

$ pnpm model:smoke
model-smoke: OK (13 checks)

$ pnpm verify:supabase-project
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.

$ pnpm typecheck
> tsc --noEmit
(no output — clean)

$ pnpm lint
> eslint
(no output — clean)

$ pnpm exec supabase test db
All tests successful.
Files=7, Tests=59,  0 wallclock secs ( ... )
Result: PASS
```

## Operator acceptance steps

Not exercised against a live ticket in this session (no browser walk-through
performed by the implementer). Recommended manual smoke for an operator:

1. Sign in to the dev app, open a workspace with an `open` paste-brief
   ticket (or create a new one via `New brief → paste`).
2. Open the ticket detail page. Confirm the new `Failure test` section is
   visible.
3. Click `Inject controlled failure`. Button changes to `Writing failure…`,
   page revalidates.
4. Confirm `StatusPill` reads `failed` and the `failure_type: execution_error`
   chip appears.
5. Confirm the `Failure evidence` section renders one failure packet card
   with `type: execution_error`, detail mentioning `Controlled Phase 4 T2`,
   recovery suggestion `stop`, and from/to `failure-injector` →
   `central-orchestrator`.
6. Confirm a `failure.injected` row appears in the trace list with
   `seq = max(seq) + 1`.
7. Reload the page. Confirm exactly one failure packet card is shown — no
   duplicate insert occurred. The `Failure test` section should no longer
   appear (eligibility consumed).

Ticket ID exercised: _none in this session — acceptance left to operator_.

## Next recommended ticket

**Phase 4 T3 — Loop Signature.** Add detection and tagging of routing loops
on a ticket using a stable loop signature derived from the trace, surfacing
the `looped` status with read-only evidence in the existing ticket detail
UI.
