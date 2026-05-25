# Phase 4 T4 — Needs Input Flow Report

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## 1. Completion status

**Completed.** Append-only needs-input flow lands without a schema
migration. Operator can pause an eligible ticket with a structured
question and the user can answer it once. All validation gates pass.

## 2. Files changed

- `app/src/app/actions/orchestration.ts` — added two server actions
  (`requestNeedsInput`, `submitNeedsInputResponse`) plus the
  `findUnresolvedNeedsInputQuestion` helper. Imports
  `SupabaseClient` type for the shared helper.
- `app/src/components/tickets/NeedsInputPanel.tsx` — new.
- `app/src/components/tickets/RequestNeedsInputButton.tsx` — new.
- `app/src/components/tickets/NeedsInputResponseForm.tsx` — new.
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` —
  - imports new components.
  - partitions needs-input question/response packets out of `packets`.
  - computes `hasUnresolvedNeedsInput`, `canRequestNeedsInput`.
  - renders `NeedsInputPanel` above other evidence panels.
  - renders `Needs input test` section when eligible.

No schema migration. No `migrations/` files edited.

## 3. Eligibility rules

### Request (`requestNeedsInput`)

1. Session user via RLS.
2. Workspace by slug via RLS.
3. Ticket in workspace via RLS.
4. `ticket.status in ('open','in_progress')`.
5. No unresolved needs-input question packet for this ticket
   (`findUnresolvedNeedsInputQuestion` returns null).

`done`, `failed`, `looped`, and already-`needs_input` tickets are
excluded by the status check. The server action re-confirms the
unresolved check with the service-role client before any privileged
write.

### Response (`submitNeedsInputResponse`)

1. Session user via RLS.
2. Workspace by slug via RLS.
3. Ticket in workspace via RLS.
4. `ticket.status === 'needs_input'`.
5. An unresolved question packet exists for the ticket.
6. Response is non-empty after trim.
7. Response is ≤ 4000 characters.

Service-side race guard re-finds the same unresolved question packet
ID before writing.

## 4. Question trace + packet shape

Trace event:

```
event_type: 'input.requested'
from_agent: 'central-orchestrator'
to_agent:   'user'
payload: {
  question,
  reason,
  phase: 'phase4_t4',
  controlled_test: true,
  tool_use: false
}
```

Packet:

```
packet_type: 'trace'
trace_event_id: <linked>
body_parsed: {
  packet_kind: 'needs_input',
  from: 'central-orchestrator',
  to: 'user',
  question,
  reason,
  resolved: false,
  phase: 'phase4_t4',
  controlled_test: true,
  tool_use: false
}
body_raw: 'NEEDS INPUT PACKET\nFrom: central-orchestrator\nTo: user\n...'
```

The packet's `resolved` field stays `false` for life — append-only.
Resolution is signaled by the presence of a response packet whose
`body_parsed.question_packet_id` matches this packet's ID.

## 5. Response trace + packet shape

Trace event:

```
event_type: 'input.responded'
from_agent: 'user'
to_agent:   'central-orchestrator'
payload: {
  response,
  question_packet_id,
  question_trace_event_id,
  phase: 'phase4_t4',
  controlled_test: true,
  tool_use: false
}
```

Packet:

```
packet_type: 'trace'
trace_event_id: <linked>
body_parsed: {
  packet_kind: 'input_response',
  from: 'user',
  to: 'central-orchestrator',
  response,
  question_packet_id,
  question_trace_event_id,
  resolved: true,
  phase: 'phase4_t4',
  controlled_test: true,
  tool_use: false
}
body_raw: 'INPUT RESPONSE PACKET\n...---\n<response>'
```

## 6. Ticket status transitions

- Eligible `open` or `in_progress` ticket → `requestNeedsInput` →
  `needs_input`. `current_agent` set to `central-orchestrator`. No
  `failure_type` or `loop_signature` mutation.
- `needs_input` ticket → `submitNeedsInputResponse` → `in_progress`.
  `current_agent` remains `central-orchestrator`. Phase 4 T5 will
  decide where the orchestrator routes after the answer.

No `done`, `failed`, or `looped` ticket can transition through this
flow — `done` is excluded by the status check, and `failed` / `looped`
are likewise.

## 7. UI behavior

- `NeedsInputPanel` renders above the loop/failure panels when the
  ticket is `needs_input`, has any needs-input question packet, or has
  any needs-input response packet.
- Each question packet renders its question, reason, linked trace, and
  a status chip (`unresolved` amber, `resolved` emerald). A matching
  response packet, when present, renders inline as a nested response
  card with its own packet body.
- When the ticket is `needs_input` and an unresolved question exists,
  the panel renders a single `NeedsInputResponseForm` (textarea +
  submit button + 4000-char cap).
- A separate `Needs input test` section appears only when eligible
  (no unresolved question, status open/in_progress). Form fields:
  optional question + optional reason; both default to honest demo
  copy when blank.
- All copy stays honest: panel explicitly says "Append-only evidence;
  the original question packet is never updated. Resolution is recorded
  by a linked response packet. Recovery/retry continuation lands in
  Phase 4 T5." Form copy: "One answer. Recorded as append-only
  evidence. No retry action yet — Phase 4 T5 will wire continuation."
- No retry/resolve/reroute action exposed.

## 8. Validation output

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

## 9. Operator acceptance

Browser smoke was not exercised in this session (no live browser).
Steps to exercise:

1. From `app/`, `pnpm dev` (webpack-pinned) and sign in.
2. Open an `open` or `in_progress` ticket with no unresolved question.
   Note its UUID.
3. In the `Needs input test` section, leave fields blank and click
   `Ask for input`. Pending label is `Writing request…`.
4. After auto-refresh confirm:
   - Status pill becomes `needs_input`.
   - `Needs input` panel renders an `unresolved` question with the
     default copy and a response form.
   - A trace event `input.requested` (orchestrator → user) appears in
     the trace list with a `packet:trace` of kind `needs_input`.
5. Enter a response in the textarea and click `Submit response`.
   Pending label is `Submitting response…`.
6. After auto-refresh confirm:
   - Status pill returns to `in_progress`.
   - Question chip flips to `resolved` (emerald).
   - Response card renders inside the question card with the submitted
     text and a `packet:trace` of kind `input_response`.
   - Trace section shows `input.responded` (user → orchestrator).
7. Refresh and confirm no duplicate question/response.
8. Confirm the `Needs input test` section is offered again (no
   unresolved question remains).

Ticket ID actually exercised: _none_ (browser acceptance pending operator
run; all server-side and tooling gates pass).

## 10. Next recommended ticket

**Phase 4 T5 — Retry / Resolve Actions.** Build on T2/T3/T4 evidence to
add the first recovery actions: retry a failed ticket, retry after a
needs-input answer, or explicitly resolve a looped ticket. Continue the
RLS-first + append-only pattern. Question-resolution semantics are
already in place via `findUnresolvedNeedsInputQuestion` and can drive
the post-input orchestrator continuation.

## Report self-check

- line count: 247
- first 3 non-empty lines:
  1. `# Phase 4 T4 — Needs Input Flow Report`
  2. `Date: 2026-05-24`
  3. `Repo: \`C:\Users\felix\Desktop\dream_team\``
- final completion status line:
  `**Completed.** Append-only needs-input flow lands without a schema migration. Operator can pause an eligible ticket with a structured question and the user can answer it once. All validation gates pass.`
