# Phase 4 T5 — Retry / Resolve Actions Report

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## 1. Completion status

**Completed.** Two recovery actions land without a schema migration:
reopen a failed ticket, hold a looped ticket for human review. Both
write append-only recovery evidence (trace + packet) and preserve all
prior failure / loop / input evidence. A third resume-after-response
action was intentionally omitted — Phase 4 T4 already transitions
`needs_input` → `in_progress` on the response packet, so a T5 resume
action would be either a no-op or a duplicate of T4's existing flow.

Per operator direction mid-session, all Phase 4 test + recovery controls
on the ticket page were consolidated into a single collapsed
`Phase 4 inspector / test controls` `<details>` section — no new
always-visible test panel was added.

## 2. Files changed

- `app/src/app/actions/orchestration.ts` — added two server actions
  (`reopenFailedTicket`, `holdLoopedTicket`) plus a shared
  `writeRecoveryEvidence` helper. Adds the `RECOVERY_PHASE`,
  `RECOVERY_REOPEN_EVENT`, `RECOVERY_HOLD_EVENT` constants. No edits
  to T2/T3/T4 paths.
- `app/src/components/tickets/RecoveryActions.tsx` — new. Exports
  `ReopenFailedTicketAction` and `HoldLoopedTicketAction` client
  components.
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`:
  - imports the recovery action components.
  - computes `canReopenFailed`, `canHoldLooped`, `hasAnyPhase4Action`.
  - replaces the three previously always-visible Phase 4 sections
    (failure test, loop test, needs-input test) with a single
    collapsed `<details>` block that conditionally renders only
    eligible actions (T5 recovery actions + T2/T3/T4 test actions).

No schema migration. No `migrations/` files touched. No edits to the
T4 needs-input flow.

## 3. Actions implemented

| Action                       | Server action          | Trace event              | Packet kind | Status change                                   |
|-----------------------------|------------------------|--------------------------|-------------|-------------------------------------------------|
| Reopen for orchestrator     | `reopenFailedTicket`   | `recovery.requested`     | `recovery`  | `failed` → `open`, `current_agent` → `central-orchestrator` |
| Hold for human review       | `holdLoopedTicket`     | `recovery.hold_requested`| `recovery`  | `looped` → `needs_input`, `current_agent` → `human-review`  |
| Resume after response       | (omitted)              | —                        | —           | Already performed by T4 `submitNeedsInputResponse`           |

## 4. Eligibility rules

### Reopen failed (`reopenFailedTicket`)

1. Session user via RLS.
2. Workspace by slug via RLS.
3. Ticket in workspace via RLS.
4. `ticket.status === 'failed'`.
5. At least one `packets.packet_type = 'failure'` row exists for the ticket.

Service-role writes only happen after all five checks pass against the
RLS-gated session client.

### Hold looped (`holdLoopedTicket`)

1. Session user via RLS.
2. Workspace by slug via RLS.
3. Ticket in workspace via RLS.
4. `ticket.status === 'looped'`.
5. `ticket.loop_signature` is a non-null string.

Service-role writes only happen after all five checks pass.

### Resume after response (omitted)

`needs_input` tickets answered by T4 transition back to `in_progress`
inside the same `submitNeedsInputResponse` server action. The resume
trace + packet would land on a ticket whose status had already moved.
Adding a separate T5 action would either:

- Fire on a status it can never see (`needs_input` after a response),
  or
- Race against the T4 transition.

Tickets parked via T5 `holdLoopedTicket` enter `needs_input` but never
acquire an unresolved question packet, so no response form is rendered
and `submitNeedsInputResponse` is unreachable. They remain held until a
later phase wires explicit human-review exit semantics. This is called
out in the inspector UI text.

## 5. Status transitions

```
failed   --reopenFailedTicket--> open         (current_agent: central-orchestrator)
looped   --holdLoopedTicket----> needs_input  (current_agent: human-review)
```

No transition out of `done`. No transition for `open` / `in_progress`
tickets through T5 actions. `failure_type` and `loop_signature` are
**not cleared** — they remain as historical evidence per the brief's
guidance.

## 6. Recovery packet shape

Trace event:

```
event_type: 'recovery.requested' | 'recovery.hold_requested'
from_agent: 'user'
to_agent:   'central-orchestrator' | 'human-review'
payload: {
  action: 'reopen_for_orchestrator' | 'hold_for_human_review',
  previous_status: '...',
  next_status: '...',
  reason: '...',
  preserves_evidence: true,
  phase: 'phase4_t5',
  controlled_test: false,
  tool_use: false
}
```

Packet:

```
packet_type: 'trace'
trace_event_id: <linked>
body_parsed: {
  packet_kind: 'recovery',
  from: 'user',
  to: 'central-orchestrator' | 'human-review',
  action: 'reopen_for_orchestrator' | 'hold_for_human_review',
  previous_status: '...',
  next_status: '...',
  reason: '...',
  preserves_evidence: true,
  phase: 'phase4_t5',
  tool_use: false
}
body_raw: 'RECOVERY PACKET\nFrom: user\nTo: ...\n...'
```

## 7. Evidence preservation behavior

- No `DELETE` or `UPDATE` is ever issued against `packets`,
  `trace_events`, `workflow_runs`, or `artifacts`.
- All prior failure packets, the loop_signature, and prior trace
  events remain readable and visible in the `Trace` and evidence
  panels.
- `failure_type` is preserved on reopen so the historical failure
  remains attached to the ticket.
- `loop_signature` is preserved on hold so the looped status remains
  attributable to the original loop signature.
- Recovery actions add exactly one `workflow_runs` row (`status: done`,
  `model: 'deterministic/recovery'`, zero tokens / cost), one
  `trace_events` row with the next monotonic seq, and one `packets`
  row of `packet_type: 'trace'` / `body_parsed.packet_kind: 'recovery'`.

## 8. UI scope

- Removed three previously always-visible Phase 4 sections (failure
  test, loop test, needs-input test).
- Added one collapsed `<details>` block titled
  `Phase 4 inspector / test controls`. It renders only when at least
  one of `{canReopenFailed, canHoldLooped, canInjectFailure,
  canInjectLoop, canRequestNeedsInput}` is true.
- Inside the block, only eligible action cards render. Each card states:
  - the action title,
  - the status transition that will happen,
  - what evidence is preserved,
  - the action button.
- No card promises automatic success. Copy explicitly says "no model
  retry", "no model calls", and "evidence is preserved".

## 9. Hard boundaries observed

- No schema migration.
- No model calls.
- No connector work.
- No deletion or overwrite of evidence.
- No automatic rerun of model/classifier.
- No recovery action on `done` tickets.
- No broad workflow engine rewrite.
- RLS-gated session client confirms user / workspace / ticket / status
  before any service-role write.

## 10. Validation output

All gates run from `app/`:

```
$ pnpm copy:smoke
copy-smoke: OK (25 checks)

$ pnpm model:smoke
model-smoke: OK (13 checks)

$ pnpm verify:supabase-project
verify-supabase-project: OK

$ pnpm typecheck
(tsc --noEmit, no output, exit 0)

$ pnpm lint
(eslint, no output, exit 0)

$ pnpm exec supabase test db
All tests successful.
Files=7, Tests=59 ... Result: PASS
```

## 11. Operator acceptance

Browser smoke was not exercised in this session (no live browser).
Steps to exercise:

1. From `app/`, `pnpm dev` (webpack-pinned) and sign in.
2. Use the T2 failure injector to mark a ticket `failed`. Note its UUID.
   Open `Phase 4 inspector`. Confirm only `Reopen for orchestrator`
   shows under the failed ticket. Click it. Confirm:
   - Status pill returns to `open`.
   - Failure packet, `failure_type` chip, and prior traces remain
     visible.
   - A new trace event `recovery.requested` (user → central-orchestrator)
     appears with a `packet:trace` of kind `recovery`.
3. Use the T3 loop injector on a different ticket to mark it `looped`.
   Open `Phase 4 inspector`. Confirm only `Hold for human review`
   shows. Click it. Confirm:
   - Status pill becomes `needs_input`.
   - `loop_signature` chip remains.
   - Loop failure packet and loop iteration traces remain visible.
   - A new trace event `recovery.hold_requested` (user → human-review)
     appears with a `packet:trace` of kind `recovery`.
   - No needs-input response form renders (no unresolved question
     packet exists).
4. Use the T4 needs-input request on a third ticket and submit a
   response. Confirm status returns to `in_progress` via the existing
   T4 path. Confirm no T5 resume button is rendered.
5. Refresh the page after each action; confirm no duplicate recovery
   evidence and no eligible action repeats once the transition is
   recorded.

Ticket IDs actually exercised: _none_ (browser acceptance pending
operator run; all server-side and tooling gates pass).

## 12. Next recommended ticket

**Phase 4 T6 — Basic Usage Meter.** With failure visibility (T1),
controlled failure / loop simulation (T2 / T3), needs-input flow (T4),
and recovery actions (T5) in place, the next ticket should surface
per-ticket and per-workspace usage and cost from the existing
`workflow_runs` rows so operators can see the cost impact of model
calls and (deterministic) recovery events.

## Report self-check

- line count: <see echo below>
- first 3 non-empty lines:
  1. `# Phase 4 T5 — Retry / Resolve Actions Report`
  2. `Date: 2026-05-24`
  3. `Repo: \`C:\Users\felix\Desktop\dream_team\``
- final completion status line:
  `**Completed.** Two recovery actions land without a schema migration: reopen a failed ticket, hold a looped ticket for human review. Both write append-only recovery evidence (trace + packet) and preserve all prior failure / loop / input evidence. A third resume-after-response action was intentionally omitted — Phase 4 T4 already transitions \`needs_input\` → \`in_progress\` on the response packet, so a T5 resume action would be either a no-op or a duplicate of T4's existing flow.`
