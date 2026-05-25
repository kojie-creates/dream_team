# Phase 2 T3 — Coordinator + Specialist Stub Artifact Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates).** Live operator acceptance loop deferred to Felix per the same protocol as T2.

After T2 classification flips a ticket to `in_progress`, a new deterministic action routes it through one Coordinator trace and one Specialist trace, writes one `artifacts` row + one `packets` row of type `artifact`, and transitions the ticket to `done`. No model call. Schema unchanged. RLS-gated authorization precedes every service-role write.

## 2. Files changed

Created:
- `app/src/components/tickets/RunSpecialistPassButton.tsx` — client form for the new action.
- `app/scripts/copy-smoke.mjs` — honest-copy static check; asserts no rendered `/stub/i` text in the three user-facing T3 surfaces (component filename `RunOrchestratorStubButton.tsx` is allowed; only rendered copy counts).
- `docs/briefs/phase2_t3_coordinator_specialist_artifact_report.md` — this file.

Modified:
- `app/src/app/actions/orchestration.ts` — added `runCoordinatorSpecialistPass`. Layer→specialist map: `build→architect`, `research→research-analyst`, `operate→devops`, `distribution→marketing-strategy`, `learning→analytics`. Coordinator ID is `<layer>-coordinator`. Dropped the `runOrchestratorStub` / `OrchestratorStubState` aliases (no remaining callers).
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` — queries `artifacts`, derives `canRunSpecialistPass` eligibility (`status=in_progress` AND classified event AND no existing artifact), renders the T3 button and a new `Artifacts` section that shows the linked `artifact` packet body.
- `app/package.json` — added `copy:smoke` script.

No migration. No schema change. No new dependency.

## 3. Trace rows written by the new action

Two trace events per pass, in order:

| seq | event_type | from_agent | to_agent | payload (top-level keys) |
|---|---|---|---|---|
| n+1 | `coordinator.routed` | `central-orchestrator` | `<layer>-coordinator` | `layer`, `reason`, `tool_use:false`, `phase:'phase2_t3'`, `classified_event_id`, `ticket_id` |
| n+2 | `specialist.artifact.created` | `<specialist>` | `central-orchestrator` | `artifact_id`, `artifact_kind:'markdown'`, `artifact_title`, `source_trace_event_id`, `bytes`, `tool_use:false`, `phase:'phase2_t3'` |

Where `n` is the highest existing `trace_events.seq` for the ticket at action start (so the coordinator event lands at `seq=2` in the common case after T2's `seq=1` classification).

## 4. Artifact row shape

Schema-honest: `public.artifacts` (migration 0005) has no `body` columns. Content lives in the linked packet; the artifact row is the metadata pointer.

| Column | Value |
|---|---|
| `workspace_id` | workspace id |
| `ticket_id` | ticket id |
| `kind` | `'markdown'` |
| `storage_path` | `null` (no Storage bucket in Phase 2; bucket integration deferred) |
| `mime_type` | `'text/markdown'` |
| `bytes` | UTF-8 byte length of the markdown body |

## 5. Packet row shape

One row, `packet_type='artifact'`, linked via `trace_event_id` to the Specialist event.

`body_raw` (labeled-field header + body):
```
ARTIFACT PACKET
from: <specialist>
to: central-orchestrator
artifact_id: <uuid>
artifact_kind: markdown
title: <derived>
bytes: <int>
tool_use: false
phase: phase2_t3
---
# <derived title>

- **Classified layer:** <layer>
- **Source ticket:** <ticket uuid>

## Anchor points from the brief

- <first non-empty brief line>
- ...up to 5 anchors...

---

_Phase 2 T3 deterministic specialist pass. No model call performed for this artifact. ..._
```

`body_parsed` mirrors the same fields as JSON: `from`, `to`, `packet_kind:'artifact'`, `artifact_id`, `artifact_kind`, `title`, `bytes`, `layer`, `bullets` (array), `markdown` (string), `tool_use:false`, `phase:'phase2_t3'`.

The ticket detail page reads `body_parsed.markdown` (preferred) or falls back to `body_raw` to render the Artifacts section.

## 6. Workflow runs

Two rows. Both deterministic.

| run_kind | agent_id | model | tokens | cost_usd | status |
|---|---|---|---|---|---|
| coordinator | `<layer>-coordinator` | `deterministic/t3` | 0/0 | 0 | done |
| specialist | `<specialist>` | `deterministic/t3` | 0/0 | 0 | done |

## 7. Ticket status transition

Precondition: `status='in_progress'`, an `orchestrator.classified` trace event exists, no artifact yet for the ticket.

Postcondition on success:
- `status='done'`
- `layer=<classified layer>` (preserved)
- `current_agent=<specialist id>`

If the precondition is not met, the action returns a typed error string to the form state and writes nothing.

## 8. Idempotence

A second click of `Run Specialist Pass` short-circuits if any artifact row exists for the ticket: the action calls `revalidatePath` and returns. No duplicate artifact, no duplicate coordinator/specialist trace, no double `done` transition. Same app-level discipline as Phase 1/T2.

## 9. UI eligibility

```
canRunStub               = (status === 'open')
canRunSpecialistPass     = (status === 'in_progress')
                         && (has orchestrator.classified event)
                         && (artifacts.length === 0)
```

Only one of the two action panels can be visible at a time. After T3 success, neither shows: the ticket is `done` and has an artifact.

## 10. Validation output (exact pass lines)

### `pnpm model:smoke`
```
model-smoke: OK (13 checks)
```

### `pnpm copy:smoke`
```
copy-smoke: OK (3 checks)
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
Applies 0001..0005 cleanly; NOTICE chatter as before.

### `pnpm exec supabase test db`
```
Files=7, Tests=59,  0 wallclock secs ...
Result: PASS
```

No schema change in this ticket, so the existing 59-test pgtap suite is the relevant gate. The T2-added `workflow_runs`/`packets` `authenticated`-insert denials still cover the T3 service-role writes negatively.

## 11. `runOrchestratorStub` alias

**Removed.** Both the function alias and the `OrchestratorStubState` type alias are gone. The only remaining `Stub` token in the user-facing tree is the component **filename** (`RunOrchestratorStubButton.tsx`); rendered text contains zero `/stub/i` matches per `copy-smoke`. Component-file rename is deferred to keep this diff narrow and to avoid sweeping imports across the workspace.

## 12. Failed-to-open retry UI

**Deferred.** Eligibility logic already gates the action correctly for the happy path. A `failed`-status ticket still has no UI affordance to return to `open`; this is the same gap noted as a carried caveat in the T2 report. Lands cleanly in the Failure / Loop Inspector in Phase 4 — touching the ticket page now would either duplicate that work or leak premature UX into T3. Stop condition #3 ("requires another live model call") would not apply, but the optional clause in the T3 brief was conditioned on "if small," and a useful retry needs at least a `failed→open` server action plus pgtap coverage; not small enough relative to T3's scope.

## 13. Operator acceptance steps

Run from a clean dev session against `dream-team-dev` cloud Supabase.

1. Sign in. Paste a brief whose layer is unambiguous (e.g. "Build a CLI tool that exports CSV from our orders table" → expect `build`).
2. Open the new ticket. Click `Run Orchestrator` (T2). Expect ticket → `in_progress`, classification event at `#1`, layer set.
3. Page re-renders with `Coordinator + Specialist` panel visible. Click `Run Specialist Pass`.
4. Expect: button reads `Running specialist…`; page redirects; status pill flips to `Done`; agent now reads `architect` (or the mapped specialist for the classified layer); two new trace events at `#2 coordinator.routed` and `#3 specialist.artifact.created`; a packet of type `artifact` nested under `#3`; an `Artifacts` section showing the markdown with the brief's anchor lines as bullets.
5. Refresh: idempotent. No duplicate artifact, trace, or packet.
6. Workflow runs panel on Home now lists three rows for this ticket: orchestrator (with live model + tokens + cost from T2), coordinator (`deterministic/t3`), specialist (`deterministic/t3`).
7. Tickets list — ticket appears under the `Done` filter; chip counts increment.

Stop conditions explicitly checked:
- Schema can represent the artifact honestly via `artifacts` (metadata) + `packets.body_*` (content). No migration needed.
- RLS-gated read of workspace+ticket+classified-event+brief is fully done via the session client before any service-role write.
- No model call.
- Idempotence guard prevents duplicate artifacts.
- `done` requires the artifact row AND packet row both present (both are written before the ticket update; on any insert failure the action returns early with no `done` transition).

## 14. Next recommended ticket

**Phase 2 T4: QA + Truth Agent Evidence.** After the specialist artifact exists, write:
- a QA validation packet (`packet_type='handoff'` or `'trace'`, body asserting what was checked against the brief's anchor points),
- a Truth Agent verdict packet (`packet_type='truth'`),
- corresponding trace events `quality_check` and `truth_check` (per `contracts/trace-emitter-contract.md`).
The ticket should not reach `done` until the Truth verdict packet exists. T4 will rewire the lifecycle: `done` moves from "after artifact written" (T3) to "after truth verdict" (T4), and the UI will separate Trace / Packets / Artifact / Validation chain sections clearly.

Prerequisite recommendation still standing from T1/T2: land a minimal Playwright (or equivalent) smoke covering paste → Orchestrator → Specialist Pass → artifact visible. Multi-step coverage gets cheaper to maintain when the test framework is already in place.

## 15. Final status

**Phase 2 T3 — PASS (code gates). Live operator acceptance pending Felix walk-through per §13.**
