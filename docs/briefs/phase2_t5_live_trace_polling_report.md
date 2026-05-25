# Phase 2 T5 — Live Trace / Polling Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates).** Live operator acceptance walk pending per same protocol as T2/T3/T4.

T5 adds a compact progress strip and polite client-side refresh on the ticket detail page. No streaming transport. No Realtime, no SSE, no WebSocket. The polling loop ticks `router.refresh()` every 5s while the evidence chain is incomplete and stops once `truth.verdict.recorded` exists. A manual "Refresh status" button is always available. All status state is derived from existing rows (`trace_events`, `artifacts`, `briefs`).

`pnpm exec supabase db reset` was **not run** — auto-mode classifier rejects destructive ops and no migration changed in this ticket. `pnpm exec supabase test db` ran clean against the unchanged 0001..0005 migration set.

## 2. Files changed

Modified:
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` — imports `TicketProgressStrip` and `TicketAutoRefresh`; computes `hasCoordinatorEvent`, `lastUpdatedIso`, `chainComplete`, `shouldPoll`; renders strip and refresh control directly under the header.
- `app/scripts/copy-smoke.mjs` — adds the two new components to the `no rendered "stub" copy` set and adds a T5 check that rejects unguarded streaming-transport language (`realtime|real-time|sse|server-sent events|live stream|streaming|websocket`) with the same 80-char negation window the T4 check uses. Now 11 static checks total.

Created:
- `app/src/components/tickets/TicketProgressStrip.tsx` — server component. Renders six chips (Brief → Orchestrator → Coordinator → Specialist → QA → Truth). Each chip is `complete`, `next`, or `waiting` derived only from inputs the page already loads. Exports `computeProgress(input)` for unit-testing later if desired.
- `app/src/components/tickets/TicketAutoRefresh.tsx` — client component. Manual refresh button always present. When `polling` is true, sets a 5s interval that calls `router.refresh()` inside `startTransition`. Tab-visibility aware: pauses on hidden, resumes on visible. Stops once the parent flips `polling` to false.
- `docs/briefs/phase2_t5_live_trace_polling_report.md` — this file.

No migration. No schema change. No new dependency. `package.json` unchanged.

## 3. UX behavior added

1. **Progress strip** under the header on the ticket detail page. Six steps, each chip color-coded by state. The first non-complete step is rendered with a bright "next" treatment so the operator immediately sees what action to take.
2. **Refresh status button** below the strip. Triggers `router.refresh()` in a transition and disables while pending.
3. **Auto-refresh while in progress.** While the chain is incomplete, the page silently re-fetches every 5s. Once both QA and Truth events exist, polling stops and the helper text reads `Auto-refresh off — full evidence chain recorded.`
4. **Last evidence timestamp.** Localized time of the most recent `trace_events.created_at` (or artifact, or ticket open) so the operator can tell at a glance whether anything has moved.
5. **Pending button states** preserved from T2/T3/T4: `Classifying…`, `Running specialist…`, `Reviewing…`. After each action the existing `redirect(...)` already forces a full re-render of the ticket page — the new polling loop is additive, not duplicative.
6. **No duplicate-click risk.** All three action buttons still disable on `pending`. The actions remain idempotent (T2: existing-event guard, T3: existing-artifact guard, T4: existing QA+Truth guard). The auto-refresh path only reads; it never invokes a server action.

## 4. Polling vs deferral

**Polling added.** 5-second interval, scoped to the ticket detail page, only while the chain is incomplete. Tab-visibility-aware so a backgrounded tab does not poll. The brief permitted polling "only if small" — the implementation is one effect inside one client component, no new dependency, no new state, no server-side change.

Realtime and SSE explicitly **deferred**. The brief reserves these for later phases and the copy-smoke gate now actively rejects language that would imply they exist.

## 5. Refresh mechanism used

- **Automatic after action:** existing `redirect(...)` calls in `runOrchestratorClassification`, `runCoordinatorSpecialistPass`, and `runQaTruthReview` already re-render the detail page server-side. Unchanged.
- **Automatic during waiting:** `TicketAutoRefresh` → `router.refresh()` every 5s while `polling` is true.
- **Manual:** `Refresh status` button on `TicketAutoRefresh` → `router.refresh()` in a transition.

No `revalidatePath` change. No new server route.

## 6. Copy-smoke changes

- Added `TicketProgressStrip.tsx` and `TicketAutoRefresh.tsx` to the no-`stub` set.
- Added a new T5 check group: `no unguarded streaming-transport claim`. Pattern: `\b(realtime|real-time|sse|server-sent events|live stream|streaming|websocket)\b`. Allowed only if `no|not|never|without` appears within 80 chars (this is what lets `TicketAutoRefresh.tsx`'s `// No streaming. No SSE. No Realtime.` comment pass).
- Total static checks: **11** (was 6).

## 7. Validation output (exact pass lines)

### `pnpm copy:smoke`
```
  ok  - no rendered "stub" copy in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunOrchestratorStubButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunSpecialistPassButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunQaTruthReviewButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/TicketProgressStrip.tsx
  ok  - no rendered "stub" copy in src/components/tickets/TicketAutoRefresh.tsx
  ok  - no unguarded external-attestation claim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded external-attestation claim in src/components/tickets/RunQaTruthReviewButton.tsx
  ok  - no unguarded streaming-transport claim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded streaming-transport claim in src/components/tickets/TicketProgressStrip.tsx
  ok  - no unguarded streaming-transport claim in src/components/tickets/TicketAutoRefresh.tsx
copy-smoke: OK (11 checks)
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

### `pnpm exec supabase test db`
```
Files=7, Tests=59,  1 wallclock secs ...
Result: PASS
```

### `pnpm exec supabase db reset`
**Blocked by auto-mode classifier.** Same carried caveat as T3/T4. Migration set 0001..0005 unchanged in this ticket; pgtap suite ran clean against the live local DB, which is the proof that the migration set still applies. Operator should run a manual reset once before Phase 2 T6 to keep that proof fresh.

## 8. Status semantics

Step completion uses only existing facts:

| Step | Complete When |
|---|---|
| Brief | `briefText` is non-empty (page already loads `briefs.raw_text`) |
| Orchestrator | a `trace_events` row of type `orchestrator.classified` exists |
| Coordinator | a `trace_events` row of type `coordinator.routed` exists |
| Specialist | a `trace_events` row of type `specialist.artifact.created` exists AND an `artifacts` row exists |
| QA | a `trace_events` row of type `qa.validated` exists |
| Truth | a `trace_events` row of type `truth.verdict.recorded` exists |

No hidden states. No invented intermediate status. A step that cannot be determined from current data renders as `waiting` (the `○` glyph), not as `failed` or `pending` something we do not actually know.

## 9. Operator acceptance steps

1. Sign in. Open a ticket whose brief produces an unambiguous classification (e.g., `Build a CLI tool that exports CSV from our orders table` → `build`).
2. Observe the new progress strip directly below the header. With a brand-new `open` ticket: Brief = ✓ complete, Orchestrator = `next`, the rest = waiting.
3. Observe the new `Refresh status` button and the helper line `Auto-refreshing every 5s while ticket is in progress.`
4. Click **Run Orchestrator**. Button reads `Classifying…`. After redirect, Orchestrator chip flips to complete; Coordinator becomes `next`.
5. Click **Run Specialist Pass**. Button reads `Running specialist…`. After redirect, both Coordinator and Specialist chips flip to complete; QA becomes `next`.
6. Click **Run QA + Truth Review**. Button reads `Reviewing…`. After redirect, QA and Truth both flip to complete.
7. Helper text changes to `Auto-refresh off — full evidence chain recorded.` The 5s polling loop stops.
8. Hard-refresh (browser reload). No duplicate trace events, packets, artifacts, or workflow runs (the action-level idempotence guards are unchanged).
9. While the chain is partially complete, leave the tab focused for ~10s. The strip and trace should refresh silently without any user action. Switch tabs for ~10s and switch back: the loop pauses on hidden and resumes on visible (no console-visible network requests while hidden).

## 10. Hard-boundary checklist

| Boundary | Status |
|---|---|
| No schema migration | ✔ |
| No new model call | ✔ |
| No connector work | ✔ |
| No Supabase Realtime | ✔ |
| No SSE | ✔ |
| No service-role boundary change | ✔ — refresh path is read-only and uses session client |
| No ticket-state-machine change | ✔ |
| No new dependency | ✔ — `next/navigation` + `react` only |
| No streaming-implying copy | ✔ — `copy-smoke` gates it |
| Idempotence preserved | ✔ — actions unchanged; polling never invokes actions |

## 11. Carried caveats into T6

1. **`pnpm exec supabase db reset` still blocked** by auto-mode classifier. Same advice carried from T3/T4: operator should run it once locally to keep the reset-proof fresh.
2. **Playwright/regression net** still open. The new polling effect makes a Playwright smoke worth more (it's the first piece of UI state that changes without an operator click).
3. **Rejected-verdict UX** still owned by Phase 4. T5 deliberately did not add `failed`/`needs_input` reroute affordances.
4. **Failed-ticket retry UI** still owned by Phase 4.
5. **Per-workspace daily token budget** still uncollected.

## 12. Next recommended ticket

**Phase 2 T6 — File Upload + Artifact Viewer.** Polling did not expose a must-fix gap; the chain is now visible and refreshes without operator intervention. T6 should land the upload path for the brief and an artifact viewer that can render the markdown artifact T3 produces (currently rendered raw in a `<pre>` block). After T6, the next natural ticket is the Playwright regression net so the manual acceptance walk stops growing.

## 13. Final status

**Phase 2 T5 — PASS (code gates). Live operator acceptance pending Felix walk-through per §9. `supabase db reset` blocked by auto-mode classifier; the unchanged migration set is implicitly covered because `supabase test db` ran clean (Files=7, Tests=59, Result: PASS).**
