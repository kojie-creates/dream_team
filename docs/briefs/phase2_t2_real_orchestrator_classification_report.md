# Phase 2 T2 — Real Orchestrator Classification Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS-WITH-CAVEATS (code).**

Stub classification path replaced with a real, bounded Anthropic Messages API call. Server-side only. The orchestration action:

- Authenticates the user via the RLS-gated session client.
- Reads `workspaces`, `tickets`, and `briefs.raw_text` through the session client before any service-role write.
- Calls `classifyBrief()` with `mode = env.MODEL_PROVIDER_MODE` (default `dry`; production runs `anthropic`).
- Writes one `workflow_runs` row (model, prompt version, tokens, cost), one `trace_events` row (`orchestrator.classified`, payload includes `tool_use: false`), and one `handoff` packet matching the contract.
- On `ModelProviderError`: writes a `failure` packet with the contract's seven-type taxonomy and flips `tickets.status = 'failed'` with `failure_type` set.
- On success: flips `tickets.status = 'in_progress'` with `layer` set to the classified layer. The ticket is then waiting for the Coordinator step that arrives in T3.

Caveat: live end-to-end exercise against the real Anthropic API is not driven by this report — code gates pass, but the network call hits real budget and must be walked by the operator. Recommended interactive acceptance steps are in §6.

## 2. Files changed

Modified:
- `app/src/lib/model/provider.ts` — added real `anthropicClassify()`. Fetches `https://api.anthropic.com/v1/messages` with `x-api-key`, `anthropic-version: 2023-06-01`, `AbortSignal.timeout(30_000)`. Strict-JSON system prompt. Output passes through `extractJsonObject` then `validateClassification` (schema enforced against `CLASSIFY_LAYERS`). Token usage captured; cost computed from a per-model pricing table (`claude-haiku-4-5` defaulted).
- `app/src/env.ts` — added `ANTHROPIC_CLASSIFY_MODEL` (string, default `claude-haiku-4-5`) and optional `OPENAI_API_KEY` placeholder (operator added the key, not yet wired).
- `app/src/app/actions/orchestration.ts` — replaced the deterministic stub. New flow above. Exports `runOrchestratorClassification` (canonical) and `runOrchestratorStub` (alias kept for back-compat until T3 sweeps the rename through the UI).
- `app/src/components/tickets/RunOrchestratorStubButton.tsx` — uses canonical export; button copy now `Run Orchestrator` / `Classifying…`; helper text drops "Deterministic stub".
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` — section heading `Orchestrator` (was `Orchestrator (Phase 1 stub)`); empty-trace copy no longer claims "Not wired up yet in Phase 1." Honesty discipline from Phase 1 T6 §7 (BLOCK) satisfied.
- `app/scripts/model-smoke.mjs` — assertions updated for the T2 surface: api.anthropic.com URL, `x-api-key` header, `AbortSignal.timeout`, output schema validation. 13 static checks now.
- `app/supabase/tests/rls/workflow_runs_traces_packets_artifacts.test.sql` — `plan(15)` → `plan(17)`. Added two negative tests asserting `authenticated` role cannot `INSERT` into `workflow_runs` or `packets` (existing test already covered `trace_events`). Closes Phase 1 T6 §7 — Security BLOCK item #2.

Created:
- `docs/briefs/phase2_t2_real_orchestrator_classification_report.md` — this file.

No migration in this ticket. No schema change. No new dependency.

## 3. Data writes (one classification path)

On classify success, per ticket:

| Table | Row | Notes |
|---|---|---|
| `workflow_runs` | 1 row | `run_kind='orchestrator'`, `agent_id='central-orchestrator'`, `model=<live model>`, `input_tokens`, `output_tokens`, `cost_usd`, `status='done'`. |
| `trace_events` | 1 row | `seq=1`, `from_agent='user'`, `to_agent='central-orchestrator'`, `event_type='orchestrator.classified'`. Payload includes `mode`, `model`, `prompt_version`, `classification`, `verdict`, `reason`, token + cost telemetry, `tool_use: false`. |
| `packets` | 1 row | `packet_type='handoff'`, `trace_event_id` linked. `body_raw` is a labeled-field HANDOFF PACKET; `body_parsed` mirrors the trace payload plus `from`/`to`/`packet_kind`. |
| `tickets` | update | `status='in_progress'`, `layer=<classified layer>`, `current_agent='central-orchestrator'`. |

On classify failure:

| Table | Row | Notes |
|---|---|---|
| `workflow_runs` | update | `status='failed'`, `ended_at` set. |
| `trace_events` | 1 row | `event_type='orchestrator.failed'`, payload carries `failure_type` (from the closed taxonomy), `detail`, `model`, `prompt_version`. |
| `packets` | 1 row | `packet_type='failure'`, body matches Failure Packet Contract — `failure_type`, `detail`, `recovery_suggestion='retry'`. |
| `tickets` | update | `status='failed'`, `failure_type=<kind>`, `current_agent='central-orchestrator'`. |

Idempotence: if a `trace_events` row with `event_type='orchestrator.classified'` already exists for the ticket, the action no-ops and just revalidates. Same app-level guard as Phase 1.

## 4. Validation output

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
Applies migrations 0001..0005 cleanly. Same NOTICE chatter as prior phases.

### `pnpm exec supabase test db`
```
Files=7, Tests=59,  1 wallclock secs ...
Result: PASS
```
57 → 59 tests. The two new tests are the workflow_runs / packets `authenticated`-role insert denials.

### Live Anthropic call
**Not driven by this report.** A network smoke would burn real budget against the user's key. Operator should run the interactive acceptance loop in §6 to exercise the live path. The static smoke proves the boundary (URL, header, timeout, schema validation, no key leakage) without spending tokens.

## 5. Security boundary notes

- Provider module retains `import 'server-only';`. Build will fail if any client component imports it.
- `ANTHROPIC_API_KEY` lives in `serverSchema` only; never `NEXT_PUBLIC_`. Smoke asserts the negative.
- `OPENAI_API_KEY` added as optional in `serverSchema` only — not wired in any code path yet. Same posture.
- Session client (`createSupabaseServerClient`) authorizes user → workspace → ticket → brief before any service-role write. The service-role client is only constructed after the session client successfully resolves `workspaces` and `tickets` for the authenticated user. No service-role read precedes the RLS check.
- `workflow_runs`, `trace_events`, `packets` writes are now negatively tested at the pgtap layer — a hand-crafted REST call with an `authenticated` JWT cannot insert into any of them (Phase 1 T6 §7 — Security BLOCK item #2 closed).
- `AbortSignal.timeout(30_000)` bounds the live call. `max_tokens: 256` bounds the response.
- Classifier system prompt forbids tool use; the payload records `tool_use: false` so the trace makes the no-tool guarantee auditable.

## 6. Model calls and cost caveats

- Default model: `claude-haiku-4-5`. Architecture brief §5 reserves Opus 4.7 for the Orchestrator role, but for v1 classification a Haiku run is sufficient and an order of magnitude cheaper. The model is configurable via `ANTHROPIC_CLASSIFY_MODEL`; the trace event records whichever model was actually used, so a future flip to Opus is one env var away and remains forensically visible.
- Per-run cost (Haiku 4.5, rough): a 500-word brief lands around 700 input tokens + ~30 output tokens → ≈ $0.0009 per classification. The repo's pricing table also covers Sonnet and Opus so a model flip preserves cost telemetry.
- `MODEL_PROVIDER_MODE` defaults to `dry`. Operators must explicitly set `MODEL_PROVIDER_MODE=anthropic` for any live call. No accidental billing in local dev unless the env is flipped.
- Token + cost telemetry is captured on every classification, success or failure, into `workflow_runs`. The billing meter design from architecture brief §8.3 can read `agent_runs.cost_usd` (aliased to `workflow_runs.cost_usd` in Phase 1) without any further schema work.

### Recommended interactive acceptance steps (operator)

1. Set `MODEL_PROVIDER_MODE=anthropic` in `app/.env.local`. Confirm `ANTHROPIC_API_KEY` present. Restart `pnpm dev`.
2. Sign in. Paste a brief whose layer is unambiguous (e.g. "Run a competitive analysis on the three biggest workflow automation vendors" → expect `research`).
3. Submit. Click `Run Orchestrator`.
4. Expect: button reads `Classifying…`; page redirects; status pill flips to `In progress`; `Layer: <classified layer>` shows; one trace event `#1 orchestrator.classified user → central-orchestrator`; nested `packet:handoff`; payload shows `model`, `prompt_version: classify/v1`, `tool_use: false`, non-zero `input_tokens`/`output_tokens`.
5. Workflow runs panel on Home shows non-zero `cost_usd`.
6. Failure smoke: temporarily unset `ANTHROPIC_API_KEY`, paste a fresh brief, hit Run. Expect: `Classification failed: ... ANTHROPIC_API_KEY not set ...`; status pill flips to `Failed`; failure packet shown; `failure_type='dependency_unavailable'`.

## 7. What this T2 deliberately did NOT do

- Did not add a Coordinator step or specialist artifact — that is T3.
- Did not add Realtime / SSE — polling/refresh stays for T5.
- Did not add Playwright. Phase 1 T6 §7 — Tooling BLOCK is still open; recommended before T3 introduces multi-step routing where manual smokes scale poorly.
- Did not add a Failed → Open retry surface. A failed ticket currently dead-ends in the UI (the Run panel hides on non-open status). Failure inspector with retry lands in Phase 4.
- Did not introduce a partial unique index on `trace_events` for orchestrator events. App-level idempotence still wins.

## 8. Carried caveats into T3

1. **Failure retry UX.** A `failed` ticket has no path back to `open` from the UI. Acceptable for T2; address in T3 or T4.
2. **Playwright/regression net.** Still open. Should land before T4 (failure paths multiply).
3. **`runOrchestratorStub` alias.** Kept to avoid an import sweep. Remove in T3 in the same PR that introduces the Coordinator action.
4. **Per-ticket budget cap.** Not enforced yet. Architecture brief §8 risk #1 calls for a per-workspace daily token budget; the data is captured per run but no rate-limit table exists. Land alongside coordinator/specialist multi-call flows in T3 or T4.

## 9. Next recommended ticket

**Phase 2 T3: Coordinator + Specialist Stub Artifact.** Read the classified layer from the orchestrator's handoff packet, write a Coordinator routing trace (`event_type='coordinator.routed'`, `from_agent='central-orchestrator'`, `to_agent='<layer>-coordinator'`), then a Specialist event that produces a small markdown artifact row in `public.artifacts`. Render the artifact section on the ticket detail page. Storage bucket integration stays deferred per T3 scope.

## 10. Stop-condition check

None of the Phase 2 stop conditions triggered:
- No client-side key exposure (smoke asserts).
- No service-role write precedes RLS authorization.
- No schema mutation; only pgtap tests added.
- No connector / OAuth / cron / billing.
- Module stays narrow — classification only.
