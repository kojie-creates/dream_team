# Phase 2 — Acceptance Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates + operator walk).** Phase 2 closes cleanly on every automated gate. Felix completed the end-to-end operator walk in a real signed-in local browser session against `dream-team-dev`: paste brief -> orchestrator -> coordinator+specialist -> QA+truth -> done, plus upload brief -> same internal evidence chain. DB readback confirms both flows. No automated gate failed. No Phase 2 stop condition tripped.

## 2. Phase 2 scope recap

Phase 1 proved the loop shape with stubs. Phase 2 turned the orchestrator/coordinator/specialist/QA/truth chain into a real first-pass workflow that produces evidence, smoothed the wait experience with polite polling, and added the file-upload brief intake. No connectors, no Realtime/SSE, no Supabase Storage, no PDF/OCR. Schema is unchanged from Phase 1: migrations `0001..0005`.

## 3. T1–T6 summary

| Ticket | Goal | Outcome | Schema | Model use | UI surface |
|---|---|---|---|---|---|
| T1 | Server-only model provider boundary | PASS — `classifyBrief()` shipped with `dry`/`anthropic` modes, env validated, key never client-side | none | none | none |
| T2 | Real orchestrator classification | PASS — Anthropic Messages call wired with timeout, schema-validated output, telemetry into `workflow_runs`, failure-packet mapping | none | optional anthropic call gated by `MODEL_PROVIDER_MODE` | Orchestrator panel re-copied for live use |
| T3 | Coordinator + specialist deterministic artifact | PASS — `coordinator.routed` + `specialist.artifact.created` traces, `artifacts` row + linked `artifact` packet | none | none (`deterministic/t3`) | Artifacts section, Specialist Pass button |
| T4 | QA + Truth internal evidence | PASS — `qa.validated` + `truth.verdict.recorded` traces with explicit `external_attestation: false` and `Limits:` line | none | none (`deterministic/t4`) | QA Evidence + Truth Evidence sections, Review button |
| T5 | Live trace / polling | PASS — progress strip, tab-visibility-aware 5s polling, manual refresh, no streaming transport | none | none | TicketProgressStrip + TicketAutoRefresh |
| T6 | File upload + artifact viewer polish | PASS — `.txt`/`.md`/`.markdown` upload (128 KB cap), `briefs.source='file'`, artifact metadata enriched, honest "no download" copy | none | none | Upload page + form, enriched artifact rows |

Every ticket is RLS-gated before any service-role write. Idempotence guards on every action.

## 4. Automated gates — exact pass lines

### `pnpm copy:smoke`
```
  ok  - no rendered "stub" copy in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunOrchestratorStubButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunSpecialistPassButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunQaTruthReviewButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/TicketProgressStrip.tsx
  ok  - no rendered "stub" copy in src/components/tickets/TicketAutoRefresh.tsx
  ok  - no rendered "stub" copy in src/components/briefs/UploadBriefForm.tsx
  ok  - no rendered "stub" copy in src/app/w/[slug]/new/upload/page.tsx
  ok  - no unguarded external-attestation claim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded external-attestation claim in src/components/tickets/RunQaTruthReviewButton.tsx
  ok  - no unguarded streaming-transport claim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded streaming-transport claim in src/components/tickets/TicketProgressStrip.tsx
  ok  - no unguarded streaming-transport claim in src/components/tickets/TicketAutoRefresh.tsx
  ok  - no unguarded upload-overclaim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded upload-overclaim in src/app/w/[slug]/new/upload/page.tsx
  ok  - no unguarded upload-overclaim in src/components/briefs/UploadBriefForm.tsx
copy-smoke: OK (16 checks)
```

### `pnpm model:smoke`
```
  ok  - server-only import
  ok  - no NEXT_PUBLIC reference in provider
  ok  - no NEXT_PUBLIC_ANTHROPIC in env schema
  ok  - exports classifyBrief
  ok  - exports CLASSIFY_PROMPT_VERSION
  ok  - dry mode declared
  ok  - anthropic mode guarded by key
  ok  - anthropic mode calls api.anthropic.com
  ok  - anthropic auth header uses x-api-key
  ok  - anthropic call has timeout
  ok  - classifier output validated
  ok  - env schema declares MODEL_PROVIDER_MODE default dry
  ok  - env schema declares ANTHROPIC_API_KEY optional
model-smoke: OK (13 checks)
```

### `pnpm typecheck`
Exit 0. No diagnostics.

### `pnpm lint`
Exit 0. No diagnostics.

### `pnpm verify:supabase-project`
```
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

### `pnpm exec supabase db reset`
```
Applying migration 0001_phase0_foundation.sql...
Applying migration 0002_phase0_rls.sql...
Applying migration 0003_phase0_workspace_create_rpc.sql...
Applying migration 0004_phase0_invite_create_rpc.sql...
Applying migration 0005_phase1_workflow_foundation.sql...
Seeding data from supabase/seed.sql...
Restarting containers...
Finished supabase db reset on branch main.
```
Migrations `0001..0005` apply clean from a fresh DB. T3/T4/T5/T6 reports each noted the auto-mode classifier had blocked this command at ticket time; for closeout it ran successfully — confirms no migration drift across Phase 2.

### `pnpm exec supabase test db`
```
Files=7, Tests=59,  Result: PASS
```
Same 7-file pgtap suite from T2. Includes the negative `authenticated`-role insert denials on `workflow_runs`, `trace_events`, and `packets` (added in T2) — the cross-table negative coverage Phase 2 relies on.

## 5. Manual operator script (Felix-driven)

Run from a clean dev session against the cloud Supabase project.

Pre-conditions to verify in `app/.env.local` before starting:
- `MODEL_PROVIDER_MODE=anthropic` if the live classification call should be exercised. Otherwise leave as `dry`.
- `ANTHROPIC_API_KEY` present iff mode is `anthropic`.
- `NEXT_PUBLIC_SUPABASE_URL` resolves to `dream-team-dev`.

### Paste path

1. Sign in. Land on `/w/<slug>`.
2. Observe HomeIntro CTAs: **Paste a brief** (live), **Upload a brief** (live), **Generate with chat** (disabled, Phase 3).
3. Click **Paste a brief**.
4. Paste an unambiguous brief (e.g. `Build a CLI tool that exports CSV from our orders table` → expect `build`). Leave title blank. Submit.
5. Expect redirect to `/w/<slug>/tickets/<uuid>`. Title falls back to the first paste line; status pill = **Open**; brief panel renders the paste; progress strip shows Brief ✓, Orchestrator = `next`, the rest = waiting.
6. Click **Run Orchestrator**. Button reads `Classifying…`. Expect redirect; status pill = **In progress**; `Layer: build`; trace shows `#1 orchestrator.classified user → central-orchestrator`; nested `packet:handoff`; payload shows `model`, `prompt_version: classify/v1`, `tool_use: false`, non-zero `input_tokens`/`output_tokens` (when in `anthropic` mode).
7. Click **Run Specialist Pass**. Button reads `Running specialist…`. Expect redirect; trace adds `#2 coordinator.routed` and `#3 specialist.artifact.created`; **Artifacts** section renders with the new metadata row (`kind: markdown`, `type: text/markdown`, byte count, line count, created-at) and the body in a scroll-capped block. Above the list, confirm the note "Artifact body is the linked packet content stored in the database. No external file is uploaded or downloaded; there is nothing to download."
8. Click **Run QA + Truth Review**. Button reads `Reviewing…`. Expect redirect; trace adds `#4 qa.validated` and `#5 truth.verdict.recorded`; **QA evidence** section shows `result: pass`, seven ✓ rows, `external_attestation: false`; **Truth evidence** shows `verdict: accepted_internal`, rationale, and a `Limits:` line stating internal-only.
9. Confirm progress strip reaches Truth. Auto-refresh helper text flips to `Auto-refresh off — full evidence chain recorded.`
10. Return to `/w/<slug>` (Home). Confirm recent activity / workflow runs reflect the orchestrator (live model + tokens + cost when `anthropic`), coordinator, specialist, qa, truth rows.
11. Hard-reload the ticket page. No duplicate trace events, packets, artifacts, or workflow runs (idempotence preserved).

### Upload path

12. From Home, click **Upload a brief**. Expect route `/w/<slug>/new/upload`.
13. Pick a small `.txt` or `.md` file (≥20 chars after trim, ≤128 KB). Confirm the chosen-file line shows filename, byte count, and (browser-dependent) MIME type.
14. Submit. Expect redirect to `/w/<slug>/tickets/<uuid>`. Title falls back to a cleaned filename; brief subline reads `source: file`.
15. (Optional full acceptance) Run **Run Orchestrator**, **Run Specialist Pass**, **Run QA + Truth Review** on the uploaded ticket. Same shape and copy as the paste-source ticket.
16. Negative checks: re-open the upload page and try a `.pdf` — client-side error reads "Only .txt, .md, or .markdown files are accepted." Try an empty `.txt` — server returns "File is empty." Try a >128 KB `.txt` — server returns "File must be 128 KB or smaller." No partial brief or ticket row is created in either failure path.

**Operator status:** Complete. Felix completed both the paste and upload walks on 2026-05-24 local time and provided ticket URLs for DB readback.

## 6. DB readback

Two concrete tickets were provided by Felix and read back from the `dream-team-dev` Supabase project (`xmxozhibakbzsucvtucv`). Both readbacks were read-only.

### Paste path readback

Ticket: `4e004c32-acb6-4dd3-a0e8-77556d43201f`

| Field | Value |
|---|---|
| title | `Phase 2 acceptance paste fixture.` |
| status | `done` |
| layer | `distribution` |
| current_agent | `marketing-strategy` |
| brief_source | `paste` |
| word_count | `52` |
| workflow_runs | `5` |
| trace_events | `5` |
| packets | `4` |
| artifacts | `1` |
| latest_event_type | `truth.verdict.recorded` |

Trace sequence:

1. `orchestrator.classified`
2. `coordinator.routed`
3. `specialist.artifact.created`
4. `qa.validated`
5. `truth.verdict.recorded`

Packet kinds: `handoff`, `artifact`, `qa`, `truth`.

### Upload path readback

Ticket: `8c3b05c8-defb-4faa-9f57-9bd11a613961`

| Field | Value |
|---|---|
| title | `phase2 upload fixture` |
| status | `done` |
| layer | `distribution` |
| current_agent | `marketing-strategy` |
| brief_source | `file` |
| word_count | `87` |
| storage_path | `null` |
| workflow_runs | `5` |
| trace_events | `5` |
| packets | `4` |
| artifacts | `1` |
| latest_event_type | `truth.verdict.recorded` |

Trace sequence:

1. `orchestrator.classified`
2. `coordinator.routed`
3. `specialist.artifact.created`
4. `qa.validated`
5. `truth.verdict.recorded`

Packet kinds: `handoff`, `artifact`, `qa`, `truth`.

The earlier upload-fixture attempt on ticket `773392e7-e1dc-416c-84c1-59134e4e98bb` completed the evidence chain but had `brief_source='paste'`, so it was not accepted as the upload-path proof. The ticket above is the accepted upload-path readback.

### Query template

```sql
-- Replace :ticket_id with the ticket UUID from step 4 or step 14 above.
select t.title,
       t.status,
       b.source                                                       as brief_source,
       (select count(*) from public.trace_events where ticket_id = t.id) as trace_event_count,
       (select count(*) from public.packets       where ticket_id = t.id) as packet_count,
       (select count(*) from public.artifacts     where ticket_id = t.id) as artifact_count,
       (select event_type
          from public.trace_events
         where ticket_id = t.id
         order by seq desc
         limit 1)                                                     as latest_event_type
  from public.tickets t
  left join public.briefs b on b.id = t.brief_id
 where t.id = :ticket_id;
```

Expected after a full happy-path walk (orchestrator + specialist + QA/truth) on a paste-source or file-source ticket:
- `status = 'done'`
- `brief_source = 'paste'` (or `'file'` for the upload path)
- `trace_event_count = 5`
- `packet_count = 4` (handoff, artifact, qa, truth)
- `artifact_count = 1`
- `latest_event_type = 'truth.verdict.recorded'`

## 7. Claims Phase 2 supports

- Dream Team can run a bounded first-pass agent workflow from a brief.
- The workflow records trace events, packets, workflow runs, and artifact metadata.
- The Orchestrator classification can use a server-side Anthropic model call when configured (`MODEL_PROVIDER_MODE=anthropic` with `ANTHROPIC_API_KEY`).
- Coordinator, Specialist, QA, and Truth steps are deterministic internal workflow evidence in Phase 2.
- Small text/markdown file briefs (`.txt`, `.md`, `.markdown` up to 128 KB) can enter the same ticket loop as paste briefs.
- Workspace isolation is RLS-enforced; service-role writes are gated by prior session-client authorization.
- Tickets are idempotent under repeated clicks; trace history is append-only.

## 8. Claims Phase 2 does NOT support

- No external attestation, certification, or regulator-grade audit. The Truth packet says so explicitly (`external_attestation: false`, `Limits: internal deterministic review of recorded evidence only`).
- No Realtime, SSE, or WebSocket streaming. T5 added 5s polling, nothing else. Copy-smoke gates the negative.
- No Supabase Storage-backed file management. `briefs.storage_path` stays null; the `artifacts` row has no body and no download path.
- No PDF, OCR, or DOCX processing.
- No connector ingest (Drive, Slack, etc.) and no OAuth.
- No autonomous external tool use. Every payload records `tool_use: false`; the model prompt forbids tools.
- No production billing-grade cost enforcement. Per-run cost is captured into `workflow_runs.cost_usd`, but there is no per-workspace daily budget cap or rate-limit table.
- No failed→open retry UI. A failed ticket has no UI affordance to re-enter the loop. Owned by Phase 4.

## 9. Security and honesty boundaries

- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are in `serverSchema` only. Never `NEXT_PUBLIC_`. `model:smoke` asserts the negatives.
- `src/lib/model/provider.ts` starts with `import 'server-only';`. Build fails if any client component imports it.
- Every action in `app/src/app/actions/orchestration.ts` and `briefs.ts` authenticates the user via the session client, resolves workspace/ticket/brief under RLS, then opens the service-role client — never before.
- pgtap suite (`Files=7, Tests=59`) covers RLS positive and negative paths for `workspaces`, `workspace_members`, `workspace_invites`, `users_profile`, `briefs`, `tickets`, `workflow_runs`, `trace_events`, `packets`, `artifacts`, and `anonymous`. The T2 additions explicitly deny `authenticated` role inserts to `workflow_runs` and `packets`.
- The file-upload action validates extension, MIME, size, decode, trim length entirely server-side. Client-side checks exist for UX only.
- Upload accepts only text — no binary path, no Storage upload, no third-party fetch.
- Markdown is rendered as plain text inside `<pre>` blocks. No `dangerouslySetInnerHTML` on the brief, artifact, or packet body anywhere in Phase 2.
- Copy-smoke now blocks unguarded `stub`, `attested|certified|external review|third-party attestation`, `realtime|sse|streaming|websocket`, and `pdf|ocr|docx|supabase storage|storage bucket` text in user-facing surfaces. 16 static checks total.

## 10. Known caveats

1. **No Playwright/regression net.** Each Phase 2 ticket flagged this. The manual smoke surface grew across T2→T6; before Phase 3 adds more routes, a minimal Playwright suite covering paste→full chain and upload→full chain would be the cheapest defensive add.
2. **No per-workspace daily token budget.** Cost is observable per run; no enforcement table exists. Phase 3 or Phase 4 should land it before the model gets used more heavily.
3. **Rejected-verdict UX deferred.** A `rejected_internal` Truth packet renders but does not move the ticket out of `done`. Owned by Phase 4.
4. **Failed-ticket retry UI deferred.** A `failed` status dead-ends in the UI. Owned by Phase 4.
5. **`storage_path` is currently dead.** Will be repurposed (or removed) when real file storage actually lands — do not silently start writing to it.
6. **Component-file rename deferred.** `RunOrchestratorStubButton.tsx` still has `Stub` in its filename; only rendered copy needed to be honest, which is gated by `copy:smoke`.
7. **`runOrchestratorStub` alias** was removed in T3 — confirmed in this closeout.

## 11. Next recommended step

**Phase 3 T1 — Navigation + Route Skeleton.** Phase 2 closed every must-land item for the first real loop. Phase 3 needs the surrounding shell (tickets list with filters, agents directory, settings, members) to have real routes before Phase 3 feature tickets land on top. The Playwright smoke recommended in §10.2 is the strongest defensive add to run alongside T1.

## 12. Final status

**Phase 2 — PASS (code gates + operator walk). Felix completed paste and upload acceptance, and DB readback confirms both ticket chains reached `truth.verdict.recorded` with 5 trace events, 4 packets, and 1 artifact each. All seven automated gates green, including `supabase db reset` and `supabase test db` (Files=7, Tests=59, Result: PASS). No stop condition triggered.**
