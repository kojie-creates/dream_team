# Phase 2 T4 — QA + Truth Agent Evidence Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates).** Live operator acceptance walk pending Felix per the same protocol used in T2/T3.

After T3 produces the Specialist artifact, a new deterministic action records internal QA and Truth Agent evidence over the existing records. No model call. No external attestation claimed. Schema unchanged. RLS-gated authorization precedes every service-role write. Action is idempotent on repeated clicks.

`pnpm exec supabase db reset` was **not run** in this report — the auto-mode classifier rejects the destructive operation. `pnpm exec supabase test db` (the test gate that actually consumes migrations) ran clean on the existing local DB; the 0001..0005 migration set is unchanged in this ticket.

## 2. Files changed

Modified:
- `app/src/app/actions/orchestration.ts` — added `runQaTruthReview` server action. Reads user/workspace/ticket/trace_events/artifacts/artifact-packet via session client (RLS) before opening the service-role client. Writes the QA workflow run + `qa.validated` trace + QA packet, then Truth workflow run + `truth.verdict.recorded` trace + Truth packet. Idempotent on existence of either trace event type.
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` — imports `RunQaTruthReviewButton`; computes `canRunQaTruth` (status in {`in_progress`,`done`} ∧ specialist event present ∧ artifact present ∧ no QA+Truth pair); renders the T4 action panel; renders new `QA evidence` and `Truth evidence` sections.
- `app/scripts/copy-smoke.mjs` — adds `RunQaTruthReviewButton.tsx` to the no-`stub`-copy target list; adds a T4-only check that user-facing surfaces never use `attested|certified|external review|third-party attestation` unless a negation (`no|not|never|without`) is within an 80-char window. Now 6 static checks total.

Created:
- `app/src/components/tickets/RunQaTruthReviewButton.tsx` — client form for the T4 action. Helper copy explicitly says the review is internal-only and that no external attestation is claimed.
- `docs/briefs/phase2_t4_qa_truth_evidence_report.md` — this file.

No migration. No schema change. No new dependency. `package.json` unchanged.

## 3. QA workflow run, trace, and packet shapes

**`workflow_runs`** (one row):

| Column | Value |
|---|---|
| `run_kind` | `qa` |
| `agent_id` | `qa-agent` |
| `model` | `deterministic/t4` |
| `input_tokens` / `output_tokens` / `cost_usd` | 0 / 0 / 0 |
| `status` | `done` |

**`trace_events`** (one row): `event_type='qa.validated'`, `from_agent=<specialist id>`, `to_agent='qa-agent'`, `seq = max(seq)+1` at action start. Payload keys: `artifact_id`, `artifact_packet_id`, `checks`, `result`, `tool_use:false`, `phase:'phase2_t4'`.

**`packets`** (one row): `packet_type='trace'` (schema constraint allows only `handoff|failure|trace|truth|artifact`; semantic kind preserved in `body_parsed.packet_kind='qa'`). Linked via `trace_event_id`.

`body_raw` (labeled-field):
```
QA PACKET
from: qa-agent
to: central-orchestrator
artifact_id: <uuid>
artifact_packet_id: <uuid|null>
checked: artifact_row_present=<bool>, artifact_packet_present=<bool>,
         specialist_trace_present=true, coordinator_trace_present=<bool>,
         classification_trace_present=<bool>, trace_seq_monotonic=<bool>,
         no_tool_use=<bool>
result: pass|fail
tool_use: false
external_attestation: false
phase: phase2_t4
```

`body_parsed` mirrors the same fields as JSON.

Deterministic checks performed (only what code actually inspects):
1. `artifact_row_present` — `artifacts` row exists for ticket.
2. `artifact_packet_present` — `packets` row of type `artifact` linked to the specialist trace event.
3. `specialist_trace_present` — `specialist.artifact.created` event exists (precondition; always true at this point).
4. `coordinator_trace_present` — `coordinator.routed` event exists.
5. `classification_trace_present` — `orchestrator.classified` event exists.
6. `trace_seq_monotonic` — `seq` strictly increasing across all events.
7. `no_tool_use` — every event's `payload.tool_use` is `false` or absent.

`result` is `pass` iff all seven booleans are true.

## 4. Truth workflow run, trace, and packet shapes

**`workflow_runs`** (one row):

| Column | Value |
|---|---|
| `run_kind` | `truth` |
| `agent_id` | `truth-agent` |
| `model` | `deterministic/t4` |
| `input_tokens` / `output_tokens` / `cost_usd` | 0 / 0 / 0 |
| `status` | `done` |

**`trace_events`** (one row): `event_type='truth.verdict.recorded'`, `from_agent='qa-agent'`, `to_agent='truth-agent'`, `seq = qa_seq + 1`. Payload keys: `qa_packet_id`, `qa_trace_event_id`, `artifact_packet_id`, `artifact_id`, `verdict`, `rationale`, `external_attestation:false`, `tool_use:false`, `phase:'phase2_t4'`.

**`packets`** (one row): `packet_type='truth'`. Linked via `trace_event_id`.

`body_raw` (labeled-field):
```
TRUTH PACKET
from: truth-agent
to: central-orchestrator
verdict: accepted_internal | rejected_internal
evidence_reviewed: qa_packet=<uuid|null>, artifact_packet=<uuid|null>, artifact=<uuid>
external_attestation: false
limits: internal deterministic review of recorded evidence only;
        not a regulator, customer, or third-party attestation.
rationale: <one sentence>
tool_use: false
phase: phase2_t4
```

`body_parsed` mirrors the same fields plus `packet_kind:'truth'`.

Verdict mapping: `qa.result==='pass'` → `accepted_internal`; otherwise `rejected_internal`.

## 5. Ticket status transition

T3 already sets the ticket to `done` after the artifact is produced. T4's policy:

- If the Truth verdict is `accepted_internal` **and** the ticket is not already `done`, the action updates `status='done'`.
- If the verdict is `accepted_internal` and the ticket is already `done` (the common case after T3), no UPDATE is issued — the status is reaffirmed by the presence of the packets, not rewritten.
- If the verdict is `rejected_internal`, the action does **not** touch ticket status. Failure UX (failed→open retry, rejected→reroute) lands in Phase 4 per the carried caveat from T2/T3.

No state was downgraded or laundered: a ticket reaches "QA + Truth complete" only when both packets actually exist.

## 6. UI changes

`app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`:

- New `QA + Truth Review` action panel, visible only when `canRunQaTruth` is true (preconditions in §1 of the brief).
- New `QA evidence` section: shows result, per-check ✓/✗ list, and a collapsible `packet body`. Header chip reads `qa-agent`; an inline label asserts `external_attestation: false`.
- New `Truth evidence` section: shows verdict, rationale, explicit `Limits:` line stating the review is internal-only, and a collapsible `packet body`. Header chip reads `truth-agent`; same `external_attestation: false` label.
- Existing Trace and Artifacts sections untouched. The QA trace event nests its packet under the trace list (existing `evPackets` logic), so the QA packet shows once in the QA section and once as a nested trace packet — by design, the user sees the chain both routed-by-event and grouped-by-kind.

Eligibility logic:

```
canRunStub           = (status === 'open')
canRunSpecialistPass = (status === 'in_progress') && hasClassifiedEvent && artifacts.length === 0
canRunQaTruth        = (status === 'in_progress' || status === 'done')
                     && hasSpecialistEvent
                     && artifacts.length > 0
                     && !(hasQaEvent && hasTruthEvent)
```

`canRunQaTruth` is intentionally permissive on `done` so T3-completed tickets that pre-date T4 (or where the operator wants to re-check) can still be reviewed. Duplicate prevention is enforced by the `!(hasQaEvent && hasTruthEvent)` guard on the UI **and** by idempotence checks inside the action.

## 7. Validation output (exact pass lines)

### `pnpm copy:smoke`
```
  ok  - no rendered "stub" copy in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunOrchestratorStubButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunSpecialistPassButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunQaTruthReviewButton.tsx
  ok  - no unguarded external-attestation claim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded external-attestation claim in src/components/tickets/RunQaTruthReviewButton.tsx
copy-smoke: OK (6 checks)
```

### `pnpm model:smoke`
```
model-smoke: OK (13 checks)
```

### `pnpm typecheck`
Exit 0, no diagnostics.

### `pnpm lint`
Exit 0, no diagnostics.

### `pnpm verify:supabase-project`
```
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

### `pnpm exec supabase db reset`
**Blocked by auto-mode classifier** (destructive op against local DB without explicit operator approval). Migration set 0001..0005 is unchanged in this ticket; the most recent successful reset is the one logged in the T3 report.

### `pnpm exec supabase test db`
```
Files=7, Tests=59,  1 wallclock secs ...
Result: PASS
```

Same 59-test pgtap suite. No schema change → no new tests required at the DB layer. The T2-added `workflow_runs`/`packets` `authenticated`-insert denials still cover the T4 service-role writes negatively.

## 8. Copy-smoke extension

Extended. The script now ships two distinct check groups:

1. **No `stub` in rendered copy** — original T3 check, plus the new T4 button file.
2. **No unguarded external-attestation claim** — new T4 check. Pattern: `\b(attested|certified|external\s+review|third[-\s]?party\s+attestation)\b`. A hit is allowed only if `no|not|never|without` appears within 80 chars of context. Applied to the ticket detail page and the new T4 button.

Total checks: 6 (was 3).

## 9. Schema posture

**Unchanged.** No migration. The existing `packets.packet_type` enum (`handoff|failure|trace|truth|artifact`) lacks a `qa` value, so the QA packet uses `packet_type='trace'` and asserts semantic kind via `body_parsed.packet_kind='qa'`. The trace `event_type='qa.validated'` is the authoritative QA marker; the page filters QA packets by the (`packet_type='trace'` ∧ `body_parsed.packet_kind='qa'`) pair. Honest representation does not require a schema change; adding a `qa` enum value would be cosmetic and force a coupled migration + pgtap update that the brief explicitly discourages.

## 10. Idempotence

Two layers:

1. **App-level guard on read** — if both `qa.validated` and `truth.verdict.recorded` events exist for the ticket, the action revalidates and returns `null` without any write. This is the common no-op path on a second click.
2. **Mixed-state guard** — if only one of the two events exists (e.g. a prior partial run), the action skips the missing half's `workflow_runs` + `trace_events` + `packets` writes and writes only the absent side. Sequence numbers are recomputed off the live max so no `(ticket_id, seq)` collision can occur. The Truth payload's `qa_packet_id` is looked up by `(ticket_id, trace_event_id, packet_type='trace')` so the pre-existing QA packet is referenced correctly.

## 11. Operator acceptance steps

Run from a clean dev session against the cloud Supabase project.

1. Sign in. Paste a brief whose layer is unambiguous (e.g. `Build a CLI tool that exports CSV from our orders table` → expect `build`).
2. Open the ticket. Click **Run Orchestrator** (T2). Wait for redirect.
3. Click **Run Specialist Pass** (T3). Wait for redirect.
4. Expect a new **QA + Truth Review** panel to be visible (ticket is `done`, has artifact, no QA/Truth events yet).
5. Click **Run QA + Truth Review**.
   Expect: button reads `Reviewing…`; page redirects; trace now lists `#4 qa.validated  <specialist> → qa-agent` and `#5 truth.verdict.recorded  qa-agent → truth-agent`.
6. New **QA evidence** section appears with `result: pass` and seven green ✓ check rows; the `external_attestation: false` chip is visible.
7. New **Truth evidence** section appears with `verdict: accepted_internal`, a one-sentence rationale, and a `Limits:` line explicitly stating the review is internal-only.
8. Workflow runs panel on Home now lists five rows for this ticket: orchestrator (live model), coordinator, specialist, qa, truth (last two at `deterministic/t4`, zero tokens/cost).
9. Click **Run QA + Truth Review** again (if the action panel is still rendered — it should not be, because both events now exist and `canRunQaTruth` is false). Refresh the page: no duplicate trace events, no duplicate packets, no duplicate workflow runs.

Stop conditions explicitly checked:
- Schema can represent QA/Truth evidence honestly using the existing enum (§9).
- RLS-gated session reads of workspace, ticket, trace events, artifacts, and artifact packet all precede the service-role client construction (§2).
- No model call (`workflow_runs.model='deterministic/t4'`, `payload.tool_use=false`, code path never imports `@/lib/model/provider` for T4).
- Idempotence guard prevents duplicate packets on repeated clicks (§10).
- A `done` transition is gated on `verdict==='accepted_internal'` and reaffirms a pre-existing `done` rather than inventing one.

## 12. Hard-boundary checklist

| Boundary | Status |
|---|---|
| No new model calls | ✔ deterministic, `workflow_runs.model='deterministic/t4'` |
| No connector work | ✔ |
| No schema migration | ✔ |
| No service-role read/write before RLS auth | ✔ session client resolves user/workspace/ticket/events/artifacts/artifact-packet first |
| No erasure of trace history | ✔ inserts only; the only UPDATE touches `tickets.status` |
| No external-attestation claim | ✔ packets + UI explicitly assert `external_attestation: false` and "Limits: internal deterministic review of recorded evidence only" |
| No silent conversion of failure into success | ✔ `rejected_internal` verdict does not touch ticket status |
| No Phase 4 retry/inspector behavior | ✔ failed→open retry remains deferred |

## 13. Carried caveats into T5

1. **`pnpm exec supabase db reset` blocked.** Auto-mode classifier rejected. Operator should run it once before T5 to confirm the unchanged migration set still applies clean.
2. **Failed-ticket retry UI.** Still no affordance for `failed→open` from the UI. Owned by Phase 4. Untouched by T4.
3. **Playwright/regression net.** Still open from T1/T2/T3. T5 should land it before the trace-update UX work multiplies the manual smoke surface.
4. **Per-workspace daily token budget.** Still uncollected. T4 added two zero-cost runs; the rate-limit table is still absent.
5. **Rejected-verdict UX.** A `rejected_internal` Truth packet renders in the Truth evidence section but does not move the ticket out of `done`. T4 deliberately keeps the action narrow; T5 or Phase 4 should add the explicit "needs_input" or "failed" routing for rejected verdicts.

## 14. Next recommended ticket

**Phase 2 T5: Live Trace Or Polling.** The trace list now spans up to five events (orchestrator → coordinator → specialist → qa → truth). Manual refresh is fine for a single operator but the UX gets noticeably stale during the live model call. Prefer simple polling first (architecture brief §6 reserves Realtime/SSE for later) and gate the introduction of Realtime on T1–T4 staying stable for at least one full operator pass.

Recommended polling shape: client-side `useEffect` ticking once per 2s while the ticket is `in_progress` or while the latest trace event is younger than 30s. Server stays unchanged; only `revalidatePath` on the existing actions plus a tiny re-fetch on the page.

## 15. Final status

**Phase 2 T4 — PASS (code gates). Live operator acceptance pending Felix walk-through per §11. `supabase db reset` blocked by auto-mode classifier; the unchanged migration set is implicitly covered because `supabase test db` ran clean.**
