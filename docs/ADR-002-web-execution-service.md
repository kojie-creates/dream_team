# ADR-002 — Web Execution Service (cloud-driven governed runs)

**Status:** Proposed (planning note; not yet built)
**Date:** 2026-06-09
**Author:** Architect (Build layer)
**Supersedes:** none · **Builds on:** ADR-001 (executable core), GOVERNANCE_SPEC §4/§8.5
**Routes to:** Build Coordinator → Architect → Code Developer (when scheduled)

---

## 1. Context

The governed runtime is proven: the live org graph ran a real model through
orchestrator → coordinator → specialist with real writes + RLS-persisted traces
(`runtime/test/integration/org-graph-live.test.ts`). The **desktop** is glued to it
(ADR-001 path): a brief in the desktop UI drives the full org graph in Electron
main, which has real disk for confinement.

The **web app** (`app/`, Next.js + Supabase) is the multi-tenant product surface,
but today it only **classifies** a brief (`runOrchestratorClassification` →
`classifyBrief`, `tool_use: false`). It never runs the governed loop. To make the
Manus-style web product actually execute, the cloud needs an execution path.

### Why the web app can't run the loop inline
- **Lifetime.** The governed loop runs for minutes and spawns child loops. Next.js
  server actions / route handlers are short-lived (serverless timeouts); not a host
  for a multi-minute, multi-agent run.
- **Confinement needs a sandbox.** `write_file`/`shell` require a confined
  filesystem (ADR-001 Decision 8: `software` path-prefix or `os` Docker provider).
  Serverless has no persistent, isolatable per-run disk.
- **Identity.** Persistence must happen AS the user under RLS (ADR-001 Decision 7).
  A browser can't hold a long-running privileged session safely.

## 2. Forces
- Reuse the runtime **unchanged** — the gate, tools, spawn, confinement seam, and
  RLS persistence are done and proven. The web path should add infra, not fork logic.
- Confinement must be real (the `os`/Docker provider already exists — use it).
- The UI needs **live progress** (trace stream), not just a final result.
- Cost/concurrency must be bounded (the tree budget exists per-run; the service
  needs per-workspace concurrency + spend controls on top).

## 3. Options

| Option | Shape | Verdict |
|---|---|---|
| **A. Worker + queue + per-run container** | Web enqueues a run job; a long-running worker dequeues, runs `startRun` inside a fresh container (the `os` confinement provider), streams traces. | **Recommended.** Reuses the runtime + confinement intact; the web app shrinks to enqueue + subscribe. |
| B. Durable-execution platform (Temporal / Inngest / Step Functions) | Model the loop as durable steps. | Heavy fit for the manual tool loop; still needs a sandbox for confinement. Defer. |
| C. Inline serverless | Run the loop in a server action. | Rejected — lifetime + confinement + identity all fail. |

## 4. Decision (proposed)

**Option A.** A dedicated **execution worker** (Node container) pulls run jobs from a
**queue**; each run executes `startRun` with the **`os` (Docker) confinement
provider** in a **per-run container**; **trace_events stream to the UI via Supabase
Realtime**; artifacts upload to Supabase Storage (already built, migration 0012).

```
web app (Next): enqueue run job  ─▶  queue  ─▶  execution worker
  {workspaceId, ticketId, brief,        (dequeue) │
   role=central-orchestrator,                     ├─ acquire user-scoped credential
   scoped credential}                             ├─ startRun(..., os-confinement, per-run container)
                                                  │     └─ governed org graph (gate/spawn/tools)
  UI ◀── Supabase Realtime (trace_events, ticket_id) ── append_trace_event (AS the user)
  UI ◀── artifacts (Storage + rows) ───────────────────── append_artifact / upload
```

### What is REUSED unchanged
- The entire `runtime/` package: gate, grants, `toolsForRole`, `systemForRole`,
  spawn (§8.5 Option A), tree budget, failure packets, RLS RPC sinks.
- The **`os` confinement provider** (`runtime/src/confine/docker-provider.ts`) — the
  per-run container IS that provider. No new confinement code.
- Trace/artifact persistence — `trace_events` is already append-only + RLS
  member-select, so a UI **Realtime subscription on `ticket_id`** gives live progress
  with near-zero new server code.

### What is NEW (the service)
1. A **queue** (run jobs).
2. A **worker** process (long-running; dequeues; runs `startRun`; manages per-run
   containers; enforces per-workspace concurrency + spend caps).
3. The web **enqueue** action (replaces "classify-only") and a **subscribe** hook.

## 5. Open questions (decide before build)

- **Credential model.** The worker must act AS the user under RLS. Either (a) pass
  the user's short-lived session into the job, or (b) **mint a scoped per-run JWT**
  from `SUPABASE_JWT_SECRET` server-side (ADR-001's original pre-Electron design).
  The secret lives **only in the worker**, never the browser. *(Leaning (b): narrow
  `sub`+`exp`, minted at dequeue, discarded at run end.)*
- **Queue tech.** `pg-boss` on the existing Supabase Postgres (no new infra) vs a
  managed queue (Inngest/SQS). *(Leaning pg-boss — reuses the DB.)*
- **Container substrate.** Fly Machines / E2B / Firecracker microVM per run vs a
  pooled Docker host. Must satisfy the Decision 8 `os` provider flags
  (`--network=none --cap-drop=ALL --user 1000:1000`).
- **Budget + concurrency.** The per-run tree budget ($20) exists; the service adds
  per-workspace concurrency limits and aggregate spend caps + a kill switch.
- **Timeout/cancel.** User-initiated cancel + a hard wall-clock per run.

## 6. Consequences
- **Positive:** the runtime, confinement, and persistence are reused verbatim; the
  web app's execution role shrinks to enqueue + subscribe; confinement is *stronger*
  in the cloud (per-run container = kernel isolation) than the desktop `software`
  provider.
- **Cost:** new infra to deploy + operate (worker, queue, container substrate) and
  the ops around it (scaling, spend caps, secrets in the worker).
- **Sequencing (suggested slices):**
  1. **Trace streaming to the UI** (Supabase Realtime sub on `ticket_id`) — cheap,
     independent, useful even for desktop-driven runs.
  2. **Minimal worker** running `startRun` for a queued single-agent job (prove the
     cloud path end to end, `software` confinement first).
  3. **Per-run container** confinement (swap to the `os` provider).
  4. **Org graph + controls** (orchestrator entry, per-workspace concurrency, spend
     caps, cancel).

Each slice is independently shippable; slice 1 has value on its own.
