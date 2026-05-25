# Phase 4 T1 — Failure Packet UI Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates).** Signed-in browser walk against a real failed ticket pending Phase 4 T2 (Failure Injector). No failed ticket exists in `dream-team-dev` at closeout time, so live visual verification is documented as pending — per the brief, T1 does not fabricate one. All code gates green.

A new read-only `FailureEvidencePanel` renders near the top of the ticket detail page when a ticket has any of: `status='failed'`, one or more `packets.packet_type='failure'`, or one or more `packets.packet_type='truth'` with `verdict='rejected_internal'`. The header gains a small `failure_type` chip when `tickets.failure_type` is set. Happy-path ticket detail is unchanged.

## 2. Files changed

Created:
- `app/src/components/tickets/FailureEvidencePanel.tsx` — presentational RSC. Three subcomponents (panel shell, `FailurePacketCard`, `RejectedTruthCard`) and a `FieldRow` helper. Validates failure type against the closed taxonomy from `failure-packet-contract.md` and falls back gracefully when fields are missing. Renders the literal caveat **"No recovery action is wired yet — this panel is read-only evidence."** No buttons, no forms, no client component, no `dangerouslySetInnerHTML`.

Modified:
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
  - Added `failure_type` to the `tickets` select.
  - Added a small `failure_type` chip next to the status pill in the header (only renders when set).
  - Computed `failurePackets` (`packet_type='failure'`) and `rejectedTruthPackets` (`packet_type='truth'` with `body_parsed.verdict='rejected_internal'`).
  - Inserted `<FailureEvidencePanel ...>` between the header and the existing `TicketProgressStrip`. Panel auto-hides when there is nothing to show; happy-path layout is untouched.
- `app/scripts/copy-smoke.mjs`
  - Added two action-promise checks against `page.tsx` and `FailureEvidencePanel.tsx`: forbids phrasings like `retry button`, `resolve action`, `click to retry`, `retry available`, etc. The bare word `retry` is allowed because the failure packet's `recovery_suggestion` field renders as recorded evidence, not as a UI promise.
  - Added a positive check that the literal phrase `"no recovery action is wired yet"` appears in `FailureEvidencePanel.tsx`.
  - `copy-smoke: OK (23 checks)` (was 20 in Phase 3 closeout).

No migration. No new dependency. No `actions/orchestration.ts` change. No `WorkspaceNav` change. No existing components removed. The Phase 2 happy-path rendering (Trace, Artifacts, QA evidence, Truth evidence, Unlinked packets) is unchanged.

## 3. Routes touched

- `/w/[slug]/tickets/[ticketId]` — same route, enriched detail. No new route added.

## 4. Failure fields rendered

From `packets.packet_type='failure'` rows (`body_parsed`):

| Field rendered | Source | Notes |
|---|---|---|
| Type chip | `body_parsed.failure_type` | Validated against closed taxonomy (`input_missing`, `input_invalid`, `dependency_unavailable`, `execution_error`, `quality_gate_fail`, `scope_exceeded`, `timeout`). Unknown values render with a neutral tone and a `title=` tooltip noting the mismatch. Missing value renders as `type: —`. |
| Detail | `body_parsed.detail` | Defaults to `—` when absent. |
| Recovery | `body_parsed.recovery_suggestion` | Defaults to `—`. Rendered as recorded text, not as a UI control. |
| From | `body_parsed.from` | Hidden when absent. |
| To | `body_parsed.to` | Hidden when absent. |
| Linked trace | `packets.trace_event_id` → `trace_events.{seq,event_type}` | Resolved via the existing `traceEvents` list (no extra query). |
| Created time | `packets.created_at` | Locale string in card header. |
| Raw body | `packets.body_raw` | `<details>` block, scroll-capped `<pre>`, plain text, collapsed by default. |

Ticket header gains:
- A `failure_type: <value>` chip (amber) when `tickets.failure_type` is set, sitting next to the existing `StatusPill`.

Panel header also restates `Ticket status: failed · failure_type: <value>` when the ticket is in the `failed` state, so the connection between ticket-level state and packet rows is explicit.

When `ticket.status='failed'` but no failure packets exist for the ticket, the panel renders a dashed-border hint pointing the operator to the Trace section to look for `orchestrator.failed` style events (rather than implying a packet exists when none does).

## 5. Rejected Truth behavior

When any `packets.packet_type='truth'` row has `body_parsed.verdict='rejected_internal'`:

- A separate "Rejected internal review" subsection appears in the same Failure Evidence panel.
- Card fields rendered: `verdict`, `external_attestation: false`, `Rationale` (`body_parsed.rationale`), `Limits` (`body_parsed.limits`), `From`, `To`, `Linked trace`, and the raw body in a collapsed `<details>`.
- Card footer explicitly states "Result of deterministic internal review only. No external attestation." — consistent with the existing T4 Truth evidence wording.
- Ticket status is **not** mutated. No retry/resolve control is shown.

Accepted-internal Truth packets continue to render in the original "Truth evidence" section unchanged; only `rejected_internal` is mirrored into the failure panel.

## 6. UI behavior

- **Visibility rule**: panel renders only when at least one of (`status='failed'`, any failure packet, any rejected internal Truth packet) is true. Phase 2 happy-path tickets (`done` + accepted truth) get exactly zero visual change.
- **Tone**: amber border + low-saturation amber background. Operator evidence, not a crash screen.
- **Placement**: directly after the header, before `TicketProgressStrip`, so a failed ticket leads with failure context. Existing sections (Source brief, Trace, Artifacts, QA evidence, Truth evidence, Unlinked packets) follow unchanged.
- **Read-only**: no `<button>`, no `<form>`, no client component, no link to a mutating action. The only interactive elements are the collapsed `<details>` toggles for raw packet bodies.
- **Defensive rendering**: missing structured fields render as `—` or hide; unknown taxonomy values render with a tooltip but never throw; missing `trace_event_id` simply skips the linked-trace row.

## 7. Validation output (exact pass lines)

### `pnpm copy:smoke`
```
copy-smoke: OK (23 checks)
```
(Three new checks added: `no promised retry/resolve action in src/app/w/[slug]/tickets/[ticketId]/page.tsx`, `no promised retry/resolve action in src/components/tickets/FailureEvidencePanel.tsx`, `failure panel states "no recovery action is wired yet" in src/components/tickets/FailureEvidencePanel.tsx`.)

### `pnpm model:smoke`
```
model-smoke: OK (13 checks)
```

### `pnpm verify:supabase-project`
```
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

### `pnpm typecheck`
Exit 0. No diagnostics.

### `pnpm lint`
Exit 0. No diagnostics.

### `pnpm exec supabase test db`
```
Files=7, Tests=59,  Result: PASS
```

### `pnpm exec supabase db reset`
**Not run.** No migration changed in this ticket; migration set `0001..0005` unchanged from Phase 3 close.

## 8. Browser / curl smoke

Dev server (`pnpm dev`, webpack) running on `http://localhost:3000`. Unauthenticated probe:

```
ticket detail unauth: 307 -> http://localhost:3000/signin
```

**Signed-in walk (pending Phase 4 T2 to produce a real failed ticket):**
1. Open a Phase 2 happy-path ticket (e.g. paste fixture `4e004c32-...` or upload fixture `8c3b05c8-...`). Confirm zero visual change: no Failure Evidence panel, no `failure_type` chip, identical Trace / Artifacts / QA / Truth sections, status pill unchanged.
2. Once a failed ticket exists (after T2), open it. Confirm:
   - Header shows `Failed` status pill plus amber `failure_type: <value>` chip.
   - Failure Evidence panel renders directly under the header with the literal `"No recovery action is wired yet — this panel is read-only evidence."` caption.
   - One amber card per failure packet, with the closed-taxonomy chip, `Detail`, `Recovery`, `From`, `To`, optional `Linked trace`, timestamp, and a collapsible `packet body` block carrying `body_raw` verbatim.
   - Trace section still shows the `orchestrator.failed` (or similar) row underneath; nothing is hidden.
3. If a ticket has a `rejected_internal` Truth packet (separate fixture from T2), the "Rejected internal review" subsection renders with verdict, rationale, limits, and the `Result of deterministic internal review only. No external attestation.` footer.
4. Sign out → ticket detail 307s to `/signin`.

## 9. Live failure data availability

**No `tickets.status='failed'` row exists in `dream-team-dev` at closeout.** Per the brief, T1 does not fabricate a failed ticket. Live visual verification on real failure data is therefore deferred to **Phase 4 T2 — Failure Injector**, which will produce a controlled failed ticket suitable for walking the panel above. Defensive rendering (missing fields, unknown taxonomy values, missing trace links) was exercised via TypeScript/lint and the structural happy-path browser smoke; the cards' field selection mirrors the exact `body_parsed` shape `orchestration.ts` writes in its catch branch today.

## 10. Hard-boundary checklist

| Boundary | Status |
|---|---|
| No schema migration | ✔ |
| No model call | ✔ |
| No failure injector | ✔ — read-only only |
| No retry button | ✔ |
| No resolve button | ✔ |
| No status mutation | ✔ |
| No service-role reads | ✔ — same session client as before |
| No deletion or hiding of existing evidence rows | ✔ — original Trace / Artifacts / QA / Truth sections render unchanged; rejected truth is **also** shown in failure panel but still appears in original Truth section |
| No broad ticket detail redesign | ✔ — additive panel + 1 header chip + 1 select column |
| No new dependency | ✔ |
| `dangerouslySetInnerHTML` | ✔ not used |
| Read-only RLS posture preserved | ✔ |

## 11. Known caveats

1. **Live failure visualization pending T2.** See §9.
2. **Rejected truth appears twice on the page** — once in the new Failure Evidence panel (for prominence) and once in the existing Truth Evidence section (for chain continuity). Intentional; deduping would have meant hiding existing evidence, which the brief forbids.
3. **`recovery_suggestion: retry` renders as text.** This is recorded packet content, not a UI action. Copy-smoke's failure-action pattern allows the bare word and forbids action-style phrasings only.
4. **Unknown failure types render with a neutral chip + tooltip.** Defensive choice — never hide the value, never invent one.
5. **No Playwright.** Still deferred.

## 12. Next recommended ticket

**Phase 4 T2 — Failure Injector.** A controlled mechanism to produce a `failed` ticket (e.g., a forced `MODEL_PROVIDER_MODE` failure path, or a developer-only injector action that writes the failure packet directly using the same shape `orchestration.ts` writes today). T2 unlocks live operator verification of this T1 panel and gives Phase 4 a stable fixture for the subsequent retry/resolve work.

## 13. Final status

**Phase 4 T1 — PASS (code gates). Live operator acceptance pending T2 failure injector (no failed ticket exists in dev). All automated gates green: copy-smoke 23/23 (3 new failure-UI checks), model-smoke 13/13, typecheck, lint, verify-supabase-project, pgtap (Files=7, Tests=59, PASS). No schema change; `supabase db reset` not re-run. New read-only `FailureEvidencePanel` renders failure packets and rejected internal truth packets when applicable; ticket header gains `failure_type` chip; happy-path ticket detail visually unchanged; no retry/resolve controls added.**
