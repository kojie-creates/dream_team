# Phase 2 T1 — Model Provider Boundary Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS.**

Server-only model provider boundary in place with dry-run classification. Env schema extended with `MODEL_PROVIDER_MODE` (default `dry`) and optional `ANTHROPIC_API_KEY`. New `model:smoke` script statically validates the boundary. No UI, no DB writes, no migration, no orchestrator wiring changed in this ticket — the real classification call lands in Phase 2 T2.

## 2. Files changed

Created:
- `app/src/lib/model/provider.ts` — server-only model wrapper. Exports `classifyBrief()`, `CLASSIFY_PROMPT_VERSION`, `CLASSIFY_LAYERS`, `ModelProviderError`. Two modes: `dry` (deterministic, no network) and `anthropic` (guarded, throws "not implemented in Phase 2 T1").
- `app/scripts/model-smoke.mjs` — 9-check static smoke proving `server-only` import, no `NEXT_PUBLIC_` leakage, declared exports, key guard, env schema shape.
- `docs/briefs/phase2_t1_model_provider_boundary_report.md` — this file.

Modified:
- `app/src/env.ts` — added `MODEL_PROVIDER_MODE` (enum `dry|anthropic`, default `dry`) and optional `ANTHROPIC_API_KEY` to server schema. Both server-only; not added to `clientSchema`.
- `app/.env.example` — documented the two new vars with a security note ("server-only; never NEXT_PUBLIC_*").
- `app/package.json` — added `model:smoke` script.

## 3. Data writes

None. No migration. No schema change. No row written by this ticket. Phase 1 stub orchestrator path is untouched.

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
  ok  - env schema declares MODEL_PROVIDER_MODE default dry
  ok  - env schema declares ANTHROPIC_API_KEY optional
model-smoke: OK (9 checks)
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
Files=7, Tests=57,  0 wallclock secs ...
Result: PASS
```

## 5. Security boundary notes

- `provider.ts` starts with `import 'server-only';`. Build will fail if any client component imports it.
- `ANTHROPIC_API_KEY` lives in `serverSchema` only. Not present in `clientSchema`. Not present in `.env.example` as a `NEXT_PUBLIC_` variable. Smoke asserts the negative explicitly.
- `MODEL_PROVIDER_MODE` defaults to `dry` — accidental missing config never silently calls the model.
- `anthropic` mode without `ANTHROPIC_API_KEY` raises `ModelProviderError('dependency_unavailable', ...)` rather than calling out.
- T1 does not add `pgsodium`, encrypted columns, or token storage; the key is read from server env at runtime only. No token persistence.
- `ModelProviderError` carries the failure-packet taxonomy enum exactly (`input_missing | input_invalid | dependency_unavailable | execution_error`) so the T2 orchestrator can map directly into a `packets.body_parsed` failure entry per the contract.

## 6. Model calls and cost caveats

**No model calls performed by this ticket.** Dry mode returns hard-coded shape; `cost_usd: 0`, `input_tokens: 0`, `output_tokens: 0`. Live `anthropic` branch throws before any HTTP call.

When T2 wires the real call:
- Bound input by the existing 20_000-char limit in `provider.ts` (rough ~5k token ceiling for Haiku/Sonnet/Opus).
- Record `model`, `prompt_version` (`CLASSIFY_PROMPT_VERSION = 'classify/v1'`), and token/cost into `workflow_runs` columns that already exist.
- One classification call per ticket only; idempotence guard from Phase 1 orchestration.ts must be preserved.

## 7. What this T1 deliberately did NOT do

- Did not install `@anthropic-ai/sdk`. T2 can add it or use plain `fetch`; either is a one-line change inside `classifyBrief` and does not touch callers.
- Did not modify `app/src/app/actions/orchestration.ts`. The stub path still runs verbatim.
- Did not change UI copy that says "Phase 1 stub". That copy stays honest until T2 lands the real call in the same PR that removes the label (per the Phase 1 T6 §7 honesty discipline item).
- Did not add a `tests/` framework. The minimal Playwright suite called out in Phase 1 T6 §7 ("Tooling — BLOCK") is still pending; it should land before T2 introduces network failure modes.

## 8. Next recommended ticket

**Phase 2 T2: Real Orchestrator Classification** — replace the stub payload in `orchestration.ts` with a call to `classifyBrief({ rawText, mode: 'anthropic' })`, populate `workflow_runs.{model,input_tokens,output_tokens,cost_usd}`, write a real `handoff` packet that matches the trace-emitter contract verbs (`work_received`, `routing_decision`), and map `ModelProviderError` → `packets.failure` + `tickets.status='failed'` per the failure-packet contract.

Prerequisite to T2 (carried over from Phase 1 T6 §7 — BLOCK items):
1. Add an RLS negative test asserting `authenticated` role cannot insert into `workflow_runs`/`trace_events`/`packets`.
2. Add a minimal Playwright (or equivalent) smoke for the paste → ticket → run → trace path so the T2 network call has a regression net.
3. Replace "Phase 1 stub" copy in the ticket detail page in the same change that flips to live classification.

## 9. Stop-condition check

None of the Phase 2 stop conditions triggered:
- No client-side key exposure.
- No service-role write before RLS authorization (no new writes at all).
- No schema change.
- No connector / OAuth / cron / billing surfaced.
- No drift into a general agent framework — module is a narrow `classifyBrief()` boundary, nothing else.
