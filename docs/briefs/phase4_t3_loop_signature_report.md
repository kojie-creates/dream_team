# Phase 4 T3 — Loop Signature Report

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## 1. Completion status

**Completed.** All validation gates pass. Operator-facing loop simulation
action, UI panel, and ticket-detail wiring are in place. Idempotent. No
retry/resolve/reroute behavior added.

## 2. Files changed

- `app/src/app/actions/orchestration.ts` — added `injectControlledLoop`
  server action (new, additive).
- `app/src/components/tickets/LoopEvidencePanel.tsx` — new component.
- `app/src/components/tickets/InjectControlledLoopButton.tsx` — new client
  button.
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` —
  - select `loop_signature` from `tickets`.
  - render `loop_signature` chip in header.
  - eligibility computed (`canInjectLoop`).
  - render `LoopEvidencePanel` (above existing `FailureEvidencePanel`).
  - render `InjectControlledLoopButton` when eligible.
  - failure-packet partition: loop packets surface only in loop panel;
    non-loop failure packets continue to surface in failure panel.

No schema changes. No migrations.

## 3. Eligibility rules

UI exposes the button only when:

1. User has a session and is a member of the workspace (RLS).
2. Workspace is visible to the user via `slug` (RLS).
3. Ticket belongs to that workspace and is visible (RLS).
4. `ticket.status in ('open','in_progress')`.
5. `ticket.loop_signature` is `null`.
6. No `packets` row with `packet_type='failure'` exists for the ticket.

The server action re-validates all of the above through the session/RLS
client before any service-role write, then re-confirms idempotence
service-side against `packets` and `tickets.loop_signature` to guard
against races.

`done`, `failed`, `looped`, and `needs_input` tickets are not eligible.

## 4. Loop signature format

Deterministic, derived from the ticket ID:

```
loop:phase4_t3:<ticketId>:loop-simulator->central-orchestrator
```

Stored verbatim in `tickets.loop_signature`. Echoed inside the failure
packet `body_parsed.loop_signature` and inside each loop trace event
payload. Easy to grep, easy to recognize as a T3 controlled artifact.

## 5. Server action write order

`injectControlledLoop(formData)`:

1. RLS-gated read — session user, workspace by slug, ticket in workspace.
2. RLS-gated eligibility — status check, loop_signature absent, no
   existing failure packet.
3. Service-role race guards — failure packet absent, loop_signature
   absent.
4. Compute deterministic `loopSignature`.
5. Insert `workflow_runs` row — `run_kind='specialist'`,
   `agent_id='loop-simulator'`, `model='deterministic/loop-simulator'`,
   `status='failed'`, zero tokens/cost.
6. Compute next `seq` for the ticket (max+1, +2, +3).
7. Insert `trace_events` #1 — `loop.iteration.detected`,
   `loop-simulator → central-orchestrator`, `iteration_count=1`.
8. Insert `trace_events` #2 — `loop.iteration.detected`,
   `loop-simulator → central-orchestrator`, `iteration_count=2`.
9. Insert `trace_events` #3 — `loop.terminated`,
   `central-orchestrator → user`, with `failure_type='timeout'`.
10. Insert `packets` row — `packet_type='failure'`, linked to the
    termination trace event.
11. Update `tickets` — `status='looped'`, `failure_type='timeout'`,
    `loop_signature=<sig>`, `current_agent='central-orchestrator'`.
12. `revalidatePath` on the ticket detail route.

The two iteration events share `from_agent` / `to_agent` and carry
`state_changed=false` — the exact repeat-with-no-state-change shape the
Loop Termination Contract calls a loop.

## 6. Trace event shape

Two iteration events:

- `event_type='loop.iteration.detected'`
- `from_agent='loop-simulator'`
- `to_agent='central-orchestrator'`
- payload:
  ```json
  {
    "loop_signature": "loop:phase4_t3:<ticketId>:loop-simulator->central-orchestrator",
    "iteration_count": 1, // then 2
    "max_iterations": 15,
    "state_changed": false,
    "controlled_test": true,
    "tool_use": false,
    "phase": "phase4_t3"
  }
  ```

Termination event:

- `event_type='loop.terminated'`
- `from_agent='central-orchestrator'`
- `to_agent='user'`
- payload:
  ```json
  {
    "loop_signature": "<sig>",
    "failure_type": "timeout",
    "detail": "loop detected - no state change between iterations",
    "controlled_test": true,
    "tool_use": false,
    "phase": "phase4_t3"
  }
  ```

## 7. Failure packet shape

`packet_type='failure'`, `trace_event_id` linked to the termination event.

`body_parsed`:

```json
{
  "packet_kind": "failure",
  "from": "central-orchestrator",
  "to": "user",
  "failure_type": "timeout",
  "detail": "loop detected - no state change between iterations",
  "state_at_failure": "Two consecutive controlled loop iterations used the same from/to agents with state_changed=false.",
  "recovery_suggestion": "stop",
  "loop_signature": "<sig>",
  "phase": "phase4_t3",
  "tool_use": false,
  "controlled_test": true
}
```

`body_raw` mirrors these fields in a `FAILURE PACKET` text block so the
existing packet body viewer renders honestly.

## 8. Idempotence behavior

A second invocation against the same ticket:

- Fails the RLS-gated `loop_signature is null` check → returns `error: null`,
  revalidates path, writes nothing. UI re-renders unchanged.
- Even if `loop_signature` were somehow null but a failure packet
  already existed, the `packets` idempotence check returns `error: null`
  and writes nothing.
- Service-side race guards repeat both checks after acquiring the
  service-role client.

Net result: at most one loop chain (one workflow_run, three trace events,
one failure packet, one ticket update) per ticket.

The Inject button itself disappears from the UI once the ticket has a
loop_signature (or any failure packet), so repeat presses are not even
exposed.

## 9. UI behavior

- Header now shows a `loop_signature: <prefix>…` chip (violet) alongside
  the status pill when `loop_signature` is set. Full signature is in the
  chip's `title` attribute.
- New `LoopEvidencePanel` renders above `FailureEvidencePanel` when the
  ticket is looped, has a loop_signature, or has loop failure packets.
  Lists the iteration + termination trace sequence and renders the loop
  failure packet card with type=timeout, signature, recovery=stop, and
  collapsible packet body.
- Existing `FailureEvidencePanel` no longer renders loop failure packets
  (they are partitioned into `loopFailurePackets` vs
  `nonLoopFailurePackets`), so the two panels never duplicate the same
  packet card.
- New `Loop test` section appears only when eligible. Copy:
  > Create a controlled loop signature for this ticket. This is a
  > demo/test action; no recovery action is wired yet.
- Button labels: `Inject controlled loop` / pending `Writing loop…`.
- No retry, resolve, reroute, or rerun action exposed.

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

## 11. Operator acceptance steps

The browser smoke was not exercised in this session (no live browser
available from the implementation environment). The steps to exercise:

1. From `app/`, run `pnpm dev` (webpack-pinned) and sign in.
2. Open or create an `open` paste ticket. Note its UUID.
3. On the ticket detail page, confirm a violet `Loop test` section is
   visible alongside (or instead of) the `Failure test` section.
4. Click `Inject controlled loop`. Observe pending label `Writing loop…`.
5. After reload (or auto-refresh) confirm:
   - Status pill: `looped`.
   - Header chip: `loop_signature: loop:phase4_t3:<ticketId>…`.
   - `Loop evidence` panel renders with iteration #N, iteration #N+1,
     and `loop.terminated (failure_type=timeout)`.
   - Loop failure packet card shows type=timeout, recovery=stop,
     `controlled_test: true`.
   - Trace section shows the three new trace events in order.
6. Refresh the page — confirm no duplicate loop chain (still exactly one
   failure packet, one workflow_run for `loop-simulator`, three new
   trace events).
7. Confirm neither `Loop test` nor `Failure test` is offered anymore.

Ticket ID actually exercised: _none_ (browser acceptance pending operator
run; all server-side and tooling gates pass).

## 12. Next recommended ticket

**Phase 4 T4 — Needs Input Flow.** Introduce an analogous controlled path
for the `needs_input` ticket status: explicit operator prompt, evidence
chain, and UI panel describing the pending input requirement. Keep the
same shape (RLS-gated authorize → service-role write → idempotent →
read-only UI) as T2 and T3.

## Report self-check

- line count: 259
- first 3 non-empty lines:
  1. `# Phase 4 T3 — Loop Signature Report`
  2. `Date: 2026-05-24`
  3. `Repo: \`C:\Users\felix\Desktop\dream_team\``
- final completion status line:
  `**Completed.** All validation gates pass. Operator-facing loop simulation action, UI panel, and ticket-detail wiring are in place. Idempotent. No retry/resolve/reroute behavior added.`
