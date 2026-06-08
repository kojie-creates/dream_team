# ADR-001 — Executable Core (Gate, Confinement, Manual Tool Loop)

**Status:** Accepted (reconciled 2026-06-07 for the Electron deployment decision)
**Date:** 2026-06-06 (rev. 2026-06-07)
**Author:** Architect (Build layer)
**Supersedes:** none
**Revision note (2026-06-07):** Deployment is now Electron (DECISIONS_LOG). Decisions 1 and 7 reconciled (runtime hosted in Electron main; renderer-IPC trigger; desktop holds a real Supabase user session instead of a minted per-run JWT). Decision 2a added (filesystem-TOCTOU rule; the `nonce` is removed — see 2a). Decision 8 fixed to Docker. The two former §6 open risks (nonce re-check, scoped-JWT TTL) are resolved and removed.
**Amendment note (2026-06-07, T4 finding):** Decision 2a.3 revised to make the pre-create parent-directory realpath/containment check a first-class, ordered step (before the create-open). T4 syscall-level testing proved the original 2a.3 sequence (open-once `O_NOFOLLOW` → post-open realpath) is necessary but not sufficient on Windows: `O_NOFOLLOW` refuses only a symlinked final component, not a junctioned ancestor, so an `O_CREAT|O_TRUNC` open through a junctioned parent creates an empty file at the escape target before the post-open re-check runs. The parent check (implemented at the `(b-pre)` step in `runtime/src/tools/write-file.ts`) fails closed having created nothing. 2a.4 and §4 constraint #2 reworded for consistency; residual micro-window noted (2a.3a, closed at kernel level by the Decision 8 Docker `os` provider).
**Inputs:** `docs/PROJECT_BRIEF_executable_core_v2.md` (authoritative), `docs/GOVERNANCE_SPEC.md`, `contracts/{failure-packet,trace-emitter,loop-termination}-contract.md`
**Routes to:** Build Coordinator → Code Developer (vertical slice in §6)

---

## 1. Context

### The problem
The Dream Team is a catalog of 28 markdown prompt files plus a Next.js dashboard. Nothing executes. We are building the **executable core**: a governed agent loop that takes a brief, runs a domain specialist that actually writes files / runs commands, and records every action as proof — comparable to Manus.ai but governed by the GOVERNANCE_SPEC tier model and the three contracts.

### Verified current state (from brief §2, confirmed in source)
- The 28 agents are markdown in a catalog UI (`app/src/lib/agents/catalog.ts`). None execute.
- One real model call exists: brief classification via **raw `fetch`** to the Anthropic Messages API (`app/src/lib/model/provider.ts`), invoked from a server action (`app/src/app/actions/orchestration.ts`). No SDK dependency is installed (`app/package.json` deps: `@supabase/{ssr,supabase-js}`, `next`, `react`, `server-only`, `zod` — no `@anthropic-ai/sdk`).
- The "specialist pass" is a deterministic template (`orchestration.ts`), `model: 'deterministic/t3'`, 0 tokens.
- Zero execution primitives in `app/src/` (no `child_process`/`spawn`/`exec`/playwright/e2b).
- Backend is Supabase. The Phase-1 workflow schema is live (migration `0005`): tables `briefs`, `tickets`, `workflow_runs`, `trace_events`, `packets`, `artifacts`. `trace_events` is **append-only** (`unique(ticket_id, seq)`, no client insert/update/delete policy) and carries `seq bigint`, `from_agent`, `to_agent`, `event_type text`, `payload jsonb`.
- **Seq is allocated read-max-then-+1** in at least 8 sites in `orchestration.ts` (`select seq … order desc limit 1` then `+1`). This collides under concurrency.
- **No application test runner.** `app/package.json` has no `test` script; only pgTAP + static smoke scripts exist.
- A `SECURITY DEFINER` RPC pattern with `set search_path = ''` is already established (migration `0003`, `create_workspace`) as the sanctioned way to do an RLS-preserving privileged insert.
- `SUPABASE_JWT_SECRET` is already in `app/src/env.ts` — minting a scoped per-run JWT is feasible without new infrastructure.
- **Orin/OBEXGATE is not in this repo.** v1's "reuse Orin as a service" assumed an integration that does not exist.

### Forces
- A long agent loop cannot live in a Next.js request/response server action (forces a separate process).
- Native local access is a **substrate, not isolation** (Security audit, brief §3): a path-prefix check is not a sandbox once a role has shell.
- The gate must be cheap, synchronous, fail-closed, and TOCTOU-safe.
- We must reuse the existing trace/packet/artifact row shapes and the three contracts — not invent a parallel telemetry system.

---

## 2. Decisions

Decisions the v2 brief already resolved are **encoded here, not relitigated** (manual loop on `@anthropic-ai/sdk`; in-process TypeScript gate; OS isolation required for shell roles; gate+confinement before the loop; vitest harness as precondition; atomic seq; scoped per-run token; runtime as a sibling Node/TS process).

---

### Decision 1 — Runtime process model and location *(revised 2026-06-07 for Electron)*

**Decision.** The runtime is a **decoupled TypeScript module hosted inside Electron's Node main process**, living in its own folder `runtime/` (own `package.json`/`tsconfig.json`; deps `@anthropic-ai/sdk`, `@supabase/supabase-js`, `vitest`, `zod`). It is **not** a separate process and **not** triggered over loopback HTTP. The **renderer (UI) triggers runs via Electron IPC** (`ipcRenderer.invoke('run:start', …)` → main-side `ipcMain.handle`). It drops into Electron main where `InnerLight_Agency_Desktop/src/main/claude.ts`'s single-shot `callClaude` chain sits today. The runtime owns the loop, gate, confinement, tracing, iteration cap, and cost accounting.

**Decoupling rule (load-bearing).** No `electron` imports may leak into the gate/loop/confinement/grant logic (`runtime/src/{gate,loop,tools,confine}/*`). Electron concerns (IPC wiring, `safeStorage` key load, `app.getPath`) live only in a thin seam `runtime/src/host/electron-adapter.ts`. This keeps the gate/loop unit-testable under vitest with no Electron runtime (preserves the T0 harness contract verbatim).

**Relationship to `app/` (explicit call).** For the desktop product the **Electron renderer replaces the Next.js web app as the UI** (reuses the InnerLight shell, IPC pattern, `electron.vite.config.ts`). The `app/` Next.js tree is **retained but out of scope for the desktop runtime path**: it remains the owner of the Supabase schema/migrations (incl. the new `0008`) and the RLS/RPC reference, and the basis for any future hosted variant. The desktop product does **not** depend on `app/` running — no loopback dependency.

**Rationale.** A many-turn `while` loop still cannot live in a Next.js server action, but Electron main is a long-lived Node process that already exists and already holds the BYOK key (`keystore.ts`, `safeStorage`/DPAPI) — the natural home. IPC removes the loopback HTTP trust boundary and its `127.0.0.1`-binding/hardening burden entirely. Keeping the runtime decoupled preserves independent testability and a clean swap path to a hosted variant without a second process.

**Consequences.** One deployable unit (the Electron app), not two. State is still shared **only through Supabase**; IPC carries only the run trigger and progress events, never authoritative state. The trust boundary moves from a loopback socket to the IPC channel — the `ipcMain` handler is the validation point (well-formed request; user is a member of the target workspace). The renderer never sees the Anthropic key or the Supabase credential — both stay in main (Decision 7). The app's classification path is untouched; the deterministic specialist pass is swapped per the regression criterion (brief §6.6) only after a characterization snapshot. **New risk — main-process co-tenancy** (gate/loop share the process with IPC/UI): tracked in §6.

---

### Decision 2 — The gate decision function (interface + two composable functions)

**Decision.** The gate is an in-process, pure-logic TypeScript module (`runtime/src/gate/`) implementing the GOVERNANCE_SPEC §6 decision flow. It exposes two composable, independently unit-testable functions:

```ts
// runtime/src/gate/workspace.ts
// Canonicalizes a requested path and asserts containment under the run's
// workspace root. NOT a string-prefix check — resolves symlinks first.
export type WorkspaceResolution =
  | { ok: true; absPath: string }                 // canonicalized, inside boundary
  | { ok: false; reason: 'outside_boundary' | 'resolve_failed'; detail: string };

export function resolveWorkspace(
  requestedPath: string,
  boundary: WorkspaceBoundary,   // { workspaceRoot: string (already realpath'd), readAllowlist: string[] }
): WorkspaceResolution;

// runtime/src/gate/gate.ts
export type Tier = 'T0' | 'T1' | 'T2' | 'T3';
export type Capability =
  | 'MDL' | 'R' | 'W' | 'DEL' | 'SH' | 'NETr' | 'NETw'
  | 'CONr' | 'CONw' | 'SEC' | 'DEP' | 'SPEND' | 'COMM' | 'SPAWN' | 'HO';

export interface GateAction {
  capability: Capability;
  // canonicalized target when path-bearing (from resolveWorkspace); null otherwise
  resolvedPath: string | null;
  actionTier: Tier;             // tier of the action CLASS (GOVERNANCE_SPEC §5)
}   // NOTE: no `nonce` — see Decision 2a (in-process gate; TOCTOU handled at the tool via open-once).

export interface GateContext {
  role: string;                 // e.g. 'code-developer'
  grant: RoleGrant;             // role's capability→max-tier map (from the matrix)
  approvals: ApprovalSet;       // standing grants + per-action human approvals (T1)
  boundary: WorkspaceBoundary;
}

export type GateDecision =
  | { verdict: 'permit'; effectiveTier: Tier }
  | { verdict: 'blocked_with_path'; missing: string; effectiveTier: 'T2' }
  | { verdict: 'blocked_hard'; reason: string; effectiveTier: 'T1' }
  | { verdict: 'blocked_scope'; reason: string }; // out-of-grant, any tier

export function gate(action: GateAction, ctx: GateContext): GateDecision;
```

`gate()` implements GOVERNANCE_SPEC §5/§6 exactly: **effective tier = stricter of (action tier, role's max tier for that capability)**; out-of-grant → `blocked_scope`; T0 never reaches the gate (the loop short-circuits it); T3 → permit if in grant; T2 → permit if grant+policy satisfied else `blocked_with_path` carrying what's missing; T1 → permit only with standing grant **and** per-action approval, else `blocked_hard`. The function is **total and synchronous** — no I/O, no awaits, no clock — so it is fully table-testable over the grant matrix.

**Rationale.** Splitting `resolveWorkspace()` (filesystem reality: realpath + containment) from `gate()` (policy: tier × grant × approval) keeps each ~50 lines and lets us table-test the policy with zero filesystem and fuzz path canonicalization separately (brief §4.1). The Python Orin sidecar is deferred (brief §3, §8). Witness Tetrad fields (input + rule + decision) are logged in the trace payload now; Ed25519 signing is later.

**Consequences.** The loop must call `resolveWorkspace()` first for any path-bearing tool and pass the result into `gate()`; it must never hand a raw path to `gate()`. There is no `nonce` (the gate is in-process and synchronous — no permit to replay; see Decision 2a). Filesystem TOCTOU is closed at the tool via the open-once rule (Decision 2a). `RoleGrant` is loaded from the GOVERNANCE_SPEC matrix (our Decision 9).

---

### Decision 2a — Side-effect TOCTOU / nonce resolution *(added 2026-06-07)*

**Context shift.** The `nonce` (Decision 2) and the §6 "nonce re-check" item were specified when the gate was assumed to be a **separate process** issuing replayable permits over a wire. The gate is now an **in-process function called synchronously in the same call stack as tool execution** (Electron main). There is no wire, no second authority, no permit to intercept/replay/retarget.

**2a.1 — The nonce is removed.** `gate()` returns a `GateDecision` synchronously into the loop; the loop passes the **same `resolvedPath`** straight into `executeTool()` with no intervening `await`, no re-resolution, no model turn between verdict and side effect. "Executed == gated" is guaranteed structurally, not cryptographically. Drop `nonce` from `GateAction`, every `GateDecision`, the `tool.executed` payload, and Decision 3 step 4d. (Witness Tetrad audit fields are unaffected; Ed25519 signing remains deferred.)

**2a.2 — The real residual risk: filesystem TOCTOU.** Between `resolveWorkspace()` validating a path **string** and `write_file` re-opening that string, an attacker/hostile dependency can swap a path component for a symlink/NTFS junction pointing outside the workspace — the string still passes; the write escapes. The nonce never addressed this (it bound the *request*, not *filesystem state*). The flaw is check-then-use-by-name: two independent resolutions of the same name against a mutable filesystem.

**2a.3 — The rule (Code Developer must follow for every path-bearing create/write/delete tool): check the real PARENT before the create, then open-once, validate the handle, write through the handle. Never validate a string then re-open it.** This rule is **general** — it binds `write_file` and any future create/write/delete tool (and the shell slice's file side effects), not `write_file` alone. Inside `execute()`, operating only on the canonical `resolvedPath`:
1. **Ensure the parent exists, then realpath the PARENT and re-assert containment — BEFORE the create-open.** The parent of a not-yet-existing target already exists (or is created in-bounds via `mkdir`); `realpath()` it and confirm by path-segment containment that the real parent is `boundary.workspaceRoot` or a descendant. If outside → fail closed, having created **nothing**. **This step is load-bearing and must precede the open**: `O_NOFOLLOW` refuses only a symlinked/junctioned **final** component — it does **not** refuse a junctioned **ancestor** directory. Because the open uses `O_CREAT|O_TRUNC`, opening a not-yet-existing target *through* a junctioned parent **creates the file at the escape target at open time**, before any post-open re-check can reject it. Realpath'ing the already-existing parent resolves a swapped-in junction to its real outside location and lets us reject before the create. (This is the open-once discipline applied to the directory the file is created in.)
2. **Open once, no-follow final component.** `fs.promises.open(resolvedPath, flags)` with `fs.constants.O_NOFOLLOW` OR'd in (`O_WRONLY|O_CREAT|O_TRUNC|O_NOFOLLOW`). Windows: libuv honors `O_NOFOLLOW` for the final reparse point (symlink/junction); `ELOOP`/any no-follow rejection → hard deny, never fall back to a string re-open.
3. **Re-assert containment on the opened object, not the string.** With the handle held, realpath the target and confirm it is `===` `boundary.workspaceRoot` or a descendant (path-segment containment, not string-prefix); on Windows also reject if `fs.promises.lstat(resolvedPath).isSymbolicLink()` on the final component (belt-and-suspenders alongside `O_NOFOLLOW`).
4. **Write through the held handle only** (`handle.write`/`handle.writeFile`). Never a second `fs.writeFile(resolvedPath, …)` by name.
5. **Fail closed** → close handle, write nothing, return `ToolObservation {ok:false, is_error:true}` mapping to failure type **`execution_error`** (permitted action, reality changed — not a grant/scope failure); emit `tool.executed` with `verdict:"error"`, `cause:"execution_error"`.

The parent-realpath check (step 1) plus the handle (steps 2–4) are the non-transferable binding the nonce was pretending to be: step 1 closes the junctioned-ancestor escape that `O_NOFOLLOW` alone leaves open, and the handle closes the final-component race.

**2a.3a — Residual micro-window.** A parent can be swapped to a junction in the gap between the step-1 parent-realpath check and the step-2 open. Software confinement is **best-effort** against this and cannot fully close it in-process; it is **acceptable for slice 1 because no hostile code executes concurrently in the workspace (no shell tool is enabled — Decision 5, Decision 8)**. The kernel-level defense that closes this window for shell-capable roles is the Docker `os` `ConfinementProvider` (Decision 8): a bind-mounted workspace gives the kernel — not application code — the final say on the boundary. This rule (2a.3) is therefore the **sole** confinement defense only for slice-1 software confinement; the moment `SH` is enabled, the `os` provider is mandatory.

**2a.4 — Location.** The TOCTOU mechanism lives entirely inside `runtime/src/tools/write-file.ts`'s `execute()` (filesystem reality = tool/confinement domain), not the loop — and includes the pre-create parent-realpath check (2a.3 step 1), implemented at the `(b-pre)` step in `write-file.ts`. The loop step 4d simplifies to a bare `if verdict==='permit'` check. `ToolExecContext` carries `boundary.workspaceRoot` (the §3 confinement↔app seam) so `execute()` re-asserts containment (parent and opened object) without re-deriving the root.

**2a.5 — Done-criterion (folds into T4).** Deterministic symlink-swap negative test: harness exposes an `afterResolveBeforeOpen` hook; after `resolveWorkspace()` returns `ok:true`, replace a path component with a junction to `os.tmpdir()/escape/`. Assert: (a) `execute()` returns `ok:false,is_error:true` cause `execution_error`; (b) **no file at the escape target**; (c) a `tool.executed` row with `verdict:"error"`; (d) `count(tool.executed)==count(tool calls)` holds.

---

### Decision 3 — Manual loop structure and where the gate call sits

**Decision.** Hand-roll the tool-use loop on `@anthropic-ai/sdk` (TypeScript). The loop owns every iteration boundary. Structure (one iteration):

```
1. messages.create({ model, max_tokens, system, messages, tools })   // model id: claude-opus-4-8
2. record usage: response.usage.{input_tokens, output_tokens,
                                 cache_read_input_tokens, cache_creation_input_tokens}
                 → accumulate cost; check budget hard-stop (Decision 10)
3. append response.content to messages as the assistant turn (verbatim — preserves tool_use blocks)
4. if response.stop_reason === 'end_turn'  → loop done (success)
   if response.stop_reason === 'pause_turn' → re-send, continue (server-tool resume; not used in slice 1)
   if response.stop_reason === 'tool_use':
        for each tool_use block:
          a. resolveWorkspace() on path args            (Decision 2)
          b. decision = gate(action, ctx)               ── THE TOOL BOUNDARY ──
          c. emit tool.executed trace event             (Decision 4) with capability/tier/gate_decision
          d. if decision.verdict === 'permit':
                 observation = await executeTool(...)   // side effect HERE; tool enforces open-once TOCTOU (Decision 2a)
             else:
                 observation = structuredBlock(decision) // "what's missing" path, is_error where apt
          e. push { type:'tool_result', tool_use_id, content: observation, is_error } into the next user turn
        append the tool_result user message; increment iteration counter; loop
5. enforce iteration cap before every messages.create (Decision 10)
```

The gate call (step 4b) is **synchronous, inside the tool boundary, strictly before the side effect** (step 4d). A block produces a `tool_result` content block carrying the structured "what's missing" path so the model can adapt within the loop (brief §4.2; GOVERNANCE_SPEC §3 `blocked_with_path`).

**Rationale.** The beta tool-runner hides exactly the seam we must instrument (gate call, trace emit, cap, cost) — rejected. Managed Agents run Anthropic-side, contradicting local execution — rejected (brief §8). The manual loop is the only option that puts our gate between the model's request and the real side effect. `claude-opus-4-8` is the current default model; usage fields are read from `response.usage`.

**Consequences.** We own correctness of the message-history contract (append `response.content` verbatim; one `tool_result` per `tool_use` id; tool_results go in a single user turn). We add `@anthropic-ai/sdk` to `runtime/`. The classification path in `app/` keeps its raw-fetch implementation — only the runtime uses the SDK.

---

### Decision 4 — Trace event schema for tool execution

**Decision.** Tool execution emits a new trace event with `event_type = "tool.executed"`, written to the existing `trace_events` table (no schema migration — reuse `seq`, `from_agent`, `to_agent`, `event_type`, `payload jsonb`). The `payload` carries the contract-required fields plus the brief §6.2 fields:

```jsonc
// trace_events.payload for event_type = "tool.executed"
{
  "verdict": "pass" | "block" | "error",      // trace-emitter contract field
  "cause": null | "<failure_type>",           // contract: failure-type when verdict != pass
  "tool_name": "write_file",
  "capability": "W",                          // brief §6.2 — REQUIRED
  "tier": "T3",                               // effective tier — brief §6.2 — REQUIRED
  "gate_decision": "permit" | "blocked_with_path" | "blocked_hard" | "blocked_scope", // §6.2 REQUIRED
  "resolved_path": "<canonical path or null>",
  "observation_summary": "<short>",           // contract: output summary
  "iteration": 7,                             // loop-termination visibility
  // Witness Tetrad (logged now, signed later):
  "witness": { "input_hash": "...", "rule": "T3:W:in_grant", "decision": "permit" }
}
```

`from_agent` = the specialist role (e.g. `code-developer`); `to_agent` = `runtime`. The mapping to the trace-emitter contract's `TRACE EVENT` labeled fields is exact: `Sequence`→`seq`, `Event type`→`event_type`, `From`/`To`→`from_agent`/`to_agent`, `Verdict`→`payload.verdict`, `Cause`→`payload.cause`, `State snapshot`→the remaining payload. Invariant from brief §6.2: **`count(tool.executed events) == count(tool calls)`** — assert in tests.

**Rationale.** `tool.executed` is a new `event_type` value, not a new column — the contract and the table already accommodate arbitrary event types with a jsonb payload, so no migration and no contract amendment is needed. Putting `capability`/`tier`/`gate_decision` in the payload satisfies brief §6.2 while keeping the row shape identical to existing events (regression-safe).

**Consequences.** Every tool call — permitted or blocked — emits exactly one `tool.executed` event before/at the side effect. Blocked-hard and blocked-scope set `verdict:"block"` and a `cause` from the closed failure taxonomy. Because the event is the audit anchor, it must be written even when the side effect is denied.

---

### Decision 5 — Tool interface contract

**Decision.** Every tool is a module implementing a fixed interface; the loop, not the tool, calls the gate.

```ts
// runtime/src/tools/types.ts
export interface ToolDef<I = unknown> {
  name: string;                          // 'write_file'
  capability: Capability;                // 'W' — what the gate checks
  actionTier: Tier;                      // 'T3' — action-class tier (GOVERNANCE_SPEC §5)
  inputSchema: JSONSchema;               // surfaced to the model in tools[]
  // Declares which input field (if any) is a workspace path → drives resolveWorkspace()
  pathArg?: keyof I;
  // Pure of governance: the loop guarantees gate-permit before this runs.
  execute(input: I, ctx: ToolExecContext): Promise<ToolObservation>;
}

export interface ToolObservation {
  ok: boolean;
  // returned to the model as tool_result content
  summary: string;
  data?: unknown;
  is_error?: boolean;
}
```

A tool **declares** its capability and action tier statically (`capability`, `actionTier`); it does **not** decide whether it may run. When the gate blocks, the loop synthesizes the `tool_result` content itself from the `GateDecision` — a structured, model-readable block:

```jsonc
// tool_result content when blocked_with_path (fed back to the model)
{ "blocked": true, "tier": "T2", "reason": "grant present but policy unmet",
  "missing": "write target is outside assigned path; request scope extension or write inside /workspace/<id>/src",
  "retryable": true }
// blocked_hard → retryable:false, "requires human approval for <action class>"
```

**Rationale.** Centralizing the gate call in the loop (not the tool) means a tool author cannot forget to gate, and the gate seam stays in exactly one place (brief §4.2). Static `capability`/`actionTier` declaration is what makes the trace assertion and the grant intersection (Decision 9) mechanical. Returning the block as a normal `tool_result` lets the model adapt in-loop rather than the run failing — the core "blocked-with-path feeds back to the model" requirement.

**Consequences.** Slice-1 ships exactly one tool: `write_file` (`capability:'W'`, `actionTier:'T3'`, `pathArg:'path'`). Shell exec and web fetch are tools too but are out of slice 1 (shell needs OS isolation first — Decision 7). The interface forbids a tool from reaching outside its `input`/`ctx` — confinement is enforced before `execute` runs, not inside it.

---

### Decision 6 — Atomic sequence allocation

**Decision.** Replace read-max-then-+1 with a `SECURITY DEFINER` Postgres RPC that allocates the next `seq` atomically and returns it (or inserts and returns in one statement). Add a new migration `app/supabase/migrations/0008_atomic_trace_seq.sql`:

```sql
-- Atomic per-ticket seq allocation. Mirrors the create_workspace RPC pattern
-- (SECURITY DEFINER, search_path = '') from migration 0003.
create or replace function public.append_trace_event(
  p_workspace_id uuid, p_ticket_id uuid, p_from_agent text,
  p_to_agent text, p_event_type text, p_payload jsonb
) returns bigint            -- returns the allocated seq
language plpgsql security definer set search_path = '' as $$
declare v_seq bigint;
begin
  -- lock the ticket row so concurrent appenders serialize on seq allocation
  perform 1 from public.tickets where id = p_ticket_id for update;
  select coalesce(max(seq), 0) + 1 into v_seq
    from public.trace_events where ticket_id = p_ticket_id;
  insert into public.trace_events
    (workspace_id, ticket_id, seq, from_agent, to_agent, event_type, payload)
  values (p_workspace_id, p_ticket_id, v_seq, p_from_agent, p_to_agent, p_event_type, p_payload);
  return v_seq;
end; $$;
```

Keep the `unique(ticket_id, seq)` backstop already on the table. All runtime trace writes go through this RPC; the read-max-then-+1 sites in `orchestration.ts` are migrated to it incrementally (the runtime uses the RPC exclusively from day one; `app/` sites are a follow-up, not a slice-1 blocker).

**Rationale.** Read-max-then-+1 collides under per-iteration concurrency and (later) sub-agent concurrency (brief §4.4). A `SELECT … FOR UPDATE` inside a `SECURITY DEFINER` function serializes allocation under a row lock; the `unique` constraint is the backstop if anything bypasses the RPC. Reusing the established `0003` RPC pattern (security definer + `search_path=''`) keeps RLS intent intact and matches a pattern the codebase already vetted.

**Consequences.** One new migration. The runtime never computes `seq` client-side. The lock is per-ticket, so cross-ticket throughput is unaffected. Monotonic `seq` (loop-termination + trace-emitter invariant) is now guaranteed by the DB, not by application timing.

---

### Decision 7 — RLS-safe write path *(revised 2026-06-07 for Electron)*

**Decision.** With Electron main as the single trusted process, there is no separate worker to mint a token *for*, so the scoped-per-run-JWT model is dropped. The desktop posture:

1. **The desktop install has a real logged-in Supabase user session.** On first run the user authenticates to Supabase (email/OTP) in main; the session (access + refresh JWT) is persisted via the same `safeStorage`/DPAPI mechanism used for the BYOK Anthropic key (`keystore.ts`). The runtime's Supabase client (`runtime/src/db/client.ts`) is built from that **user** session.
2. **The user JWT is the runtime's only Supabase identity.** All reads/writes run as that authenticated user, so the existing `auth.uid()`-based RLS (`is_workspace_member(workspace_id)` / `has_workspace_role(...)`, migrations 0002/0005/0006/0007) scopes every row to workspaces the user belongs to — **zero new policies**.
3. **The service-role key is never present in the desktop app.** It exists only in `app/` server code (`app/src/lib/supabase/service.ts`). The runtime has no god-mode credential; its JWT carries the `authenticated` role and is subject to RLS on every table.
4. **Privileged appends go through `SECURITY DEFINER` RPCs, not elevated identity.** `append_trace_event` (Decision 6, `search_path=''`) lets a member-scoped JWT append a correctly-ordered audit row without the table granting members raw insert — the established `0003` pattern.

**Why not the InnerLight precedent (anon key + `desktop_anon_select`).** That precedent uses a static anon key with `FOR SELECT TO anon USING (true)` — read-only, single-tenant, **un-scoped** (returns all tickets to any anon-key holder). Fine for read-only dashboard counts; unacceptable here because the runtime **writes** tenant-scoped rows. An unscoped anon identity would force either permissive write policies (defeating RLS) or a service-role key in the desktop (the god-mode identity this forbids). The logged-in-user model is the only posture that keeps writes correctly scoped **and** the service-role key out of the client.

**Rationale.** Brief §5.3/§3 require RLS stays enforced and the runtime is never god-mode; both hold with *less* machinery than the JWT-mint design (no `SUPABASE_JWT_SECRET` signing, no TTL/claim plumbing — moot). The desktop already has a proven secret-at-rest mechanism (`safeStorage`/DPAPI) to persist the session.

**Consequences.** Main acquires a Supabase auth step (login + session persistence via `safeStorage`) alongside BYOK storage. The former scoped-JWT TTL/claim open risk is **removed**. Credential isolation still holds: the loop runs with no `~/.ssh`/`~/.aws`/keychain access for tool execution; its only credentials are the `safeStorage` Anthropic key and the Supabase user session, both in main, never exposed to the renderer or to tool `execute()`.

---

### Decision 8 — OS-isolation boundary for shell-capable roles

**Decision.** Roles whose grant includes `SH`, dependency install, or `DEP` (per the matrix: `code-developer` `SH=T2`; `devops`/`data-pipeline`; etc.) **must** run their tool execution under OS-level isolation. **The chosen mechanism is a Docker container** (DECISIONS_LOG 2026-06-07 #2; restricted-user and E2B options dropped): workspace bind-mounted, no host network by default (default-deny outbound through a logging proxy), dropped capabilities, non-root UID. Docker Desktop becomes a prerequisite the user installs before the shell capability is available (works on Windows 11 Home via WSL2). (brief §3, §5.1, §5.3) No-shell / read-only roles (architect, ux-designer, qa-testing read-only source, truth-agent) use software confinement only: `resolveWorkspace()` canonicalized containment (Decision 2). The runtime exposes a `ConfinementProvider` seam so the same tool runs against a software boundary (no-shell) or an OS boundary (shell) without the loop knowing which.

```ts
// runtime/src/confine/provider.ts
export interface ConfinementProvider {
  kind: 'software' | 'os';
  workspaceRoot(): string;                 // realpath'd boundary — SOURCE OF TRUTH is app workspace row
  // For 'os': runs inside the isolated user/container. For 'software': in-process fs.
  exec?(cmd: string, args: string[]): Promise<ExecResult>;  // present only when kind==='os'
}
```

**Rationale.** Security audit returned *unacceptable as designed* on the path-prefix-as-sandbox model (brief headline). A path check is not a sandbox once a role has shell — symlinks, `cd ..`, `$(...)`, subprocess spawn, npm postinstall all walk around an in-process check (brief §3). Slice 1 deliberately omits shell precisely because OS isolation must land first (brief §7); the `ConfinementProvider` interface lets us ship the software boundary now and slot the OS boundary in for shell roles without reworking the loop or tools.

**Consequences.** **Slice 1 ships `software` confinement only and no shell tool** — this is a hard scope line. Shipping `write_file` for `code-developer` under software confinement is acceptable *only because no shell tool is enabled in the slice*; the moment `SH` is enabled, the `os` provider is mandatory (a precondition tracked as a separate task, not in slice 1). The workspace root is `~/InnerLightAgency/workspaces/<project-id>/` (GOVERNANCE_SPEC §8.3); the canonical root comes from the app's workspace record, never inferred by the runtime (see coupling seam in §3).

---

### Decision 9 — Per-role grants loaded from the matrix; spawn-ready

**Decision.** Role grants are loaded from a typed encoding of the GOVERNANCE_SPEC §4 matrix (`runtime/src/gate/grants.ts`) when a specialist loop instance is constructed. The grant is passed **as a parameter** into the loop instance (not a global), so `parent ∩ requested` can be added later for sub-agent spawning without reworking the loop. Sub-agent spawning itself is deferred (brief §8).

**Rationale.** Grants are data, not engineering (brief §6); encoding the matrix once and intersecting at instantiation is the cheap, legible path. Passing the grant as a parameter is the single design choice that lets §8.5 sub-agent inheritance (`parent ∩ requested`, never a superset) slot in later (brief §4.6, §8).

**Consequences.** Slice 1 instantiates exactly one role (`code-developer`) with its matrix grant. The `gate()` `GateContext.grant` is populated from this module. No spawn tool in slice 1.

---

### Decision 10 — Loop-termination and budget hard-stops

**Decision.** Wire the loop-termination contract and GOVERNANCE_SPEC §8.2 budgets as **enforced halts that emit failure packets**, not telemetry:

- **Iteration cap.** `iteration_count` starts at 0 and increments once per loop turn (each `messages.create` round). Before every `messages.create`, if `iteration_count >= MAX_ORCHESTRATION_ITERATIONS (15)`, **stop immediately**, emit a `FAILURE PACKET` with `Failure type: timeout`, `Detail: "orchestration iteration limit reached"`, attach the full trace, and escalate (loop-termination contract). The counter is never reset and is visible in every `tool.executed` payload (`iteration`).
- **Loop detection.** If two consecutive trace events have identical `from`/`to` with no state change, halt with `timeout` / `"loop detected — no state change between iterations"` (separate fixture, brief §6.4).
- **Budget.** Track model token cost per run. Soft warn at $5; **hard stop at $20/run** → halt, `FAILURE PACKET` `Failure type: scope_exceeded` (GOVERNANCE_SPEC §8.2). Non-token spend hard-stop ($10/run cumulative) applies once SPEND-capable tools exist (not slice 1). Cost is recorded per run in `workflow_runs.cost_usd` (existing column) and must be non-null and consistent with token × price (brief §6.5).

**Rationale.** The contracts require these be enforced halts emitting structured failure packets, not just logged (brief §4.7, §7; loop-termination + failure-packet contracts). The `workflow_runs.cost_usd numeric(10,4)` column already exists; we reuse it. Pricing for `claude-opus-4-8` ($5 in / $25 out per 1M) is added to the runtime's pricing table (the existing `MODEL_PRICING` in `provider.ts` predates this model and returns 0 for unknowns — the runtime must not silently price-as-0).

**Consequences.** A non-terminating tape halts at exactly iteration 15 with a `timeout` packet and full trace (brief §6.4 — a slice-1 negative test). A budget-overrun fixture halts with `scope_exceeded` (brief §6.5). Failure packets are written to the `packets` table (`packet_type:'failure'`) and a corresponding trace event with `verdict:'error'` marks the first causal break.

---

## 3. Component boundaries

New tree `runtime/` (sibling to `app/`), plus one app migration and one app trigger seam.

| Path | Responsibility (one line) |
|---|---|
| `runtime/package.json`, `runtime/tsconfig.json` | Standalone Node/TS package; depends on `@anthropic-ai/sdk`, `@supabase/supabase-js`, `vitest`, `zod`. |
| `runtime/src/index.ts` | Runtime entry: exposes `startRun({workspaceId, runId})` dispatched by the Electron adapter; pure of `electron`. |
| `runtime/src/host/electron-adapter.ts` | The only Electron-aware seam: `ipcMain.handle('run:start')`, loads BYOK key + Supabase session from `safeStorage`, calls `startRun`. |
| `runtime/src/loop/run-loop.ts` | The manual tool-use loop (Decision 3); owns iteration cap, cost, gate call placement, trace emit. |
| `runtime/src/loop/budget.ts` | Token cost accounting + hard-stop (Decision 10). |
| `runtime/src/loop/terminate.ts` | Iteration cap + loop-detection (Decision 10). |
| `runtime/src/gate/gate.ts` | Pure `gate()` decision function (Decision 2). |
| `runtime/src/gate/workspace.ts` | Pure `resolveWorkspace()` (realpath + containment) (Decision 2). |
| `runtime/src/gate/grants.ts` | Typed encoding of GOVERNANCE_SPEC §4 matrix → `RoleGrant` (Decision 9). |
| `runtime/src/confine/provider.ts` | `ConfinementProvider` interface; `software` impl for slice 1 (Decision 8). |
| `runtime/src/tools/types.ts` | `ToolDef` / `ToolObservation` interface (Decision 5). |
| `runtime/src/tools/write-file.ts` | The slice-1 tool: workspace-scoped `write_file` (`W`, `T3`). |
| `runtime/src/trace/emit.ts` | Builds `tool.executed` payload; writes via `append_trace_event` RPC (Decisions 4, 6). |
| `runtime/src/packets/failure.ts` | Builds + persists `FAILURE PACKET` rows (failure-packet contract). |
| `runtime/src/db/client.ts` | Supabase client built from the logged-in user session (Decision 7); no service-role key. |
| `runtime/src/model/client.ts` | Thin `@anthropic-ai/sdk` wrapper; **injectable** for tests (tape fixtures). |
| `runtime/test/harness/` | Vitest harness: injectable model client, "tape" fixture format, fake in-process gate, ephemeral temp-workspace, trace/DB assertion helpers (brief §4.0). |
| `app/supabase/migrations/0008_atomic_trace_seq.sql` | `append_trace_event` RPC (Decision 6). |
| Electron main (renderer→main IPC) | `run:start` IPC handler validates the user is a workspace member, then dispatches via the adapter. Replaces the former loopback `run-trigger.ts`. |

### Seams (per the v1 audit's coupling findings)
- **loop ↔ gate.** The loop calls `resolveWorkspace()` then `gate()` synchronously inside the tool boundary, before any side effect, passing the same `resolvedPath` straight into the tool (no nonce — Decision 2a). The gate is pure; the loop is the only caller. Tools never call the gate. Filesystem TOCTOU is closed inside the tool's `execute()` (open-once, Decision 2a).
- **gate ↔ confinement.** `gate()` consumes a `WorkspaceBoundary` produced by `resolveWorkspace()`, which consumes the `ConfinementProvider.workspaceRoot()`. The gate decides *policy*; confinement enforces *reality*. For shell roles the OS provider is the reality; for slice-1 no-shell roles the software provider is.
- **confinement ↔ app (workspace-root source of truth).** The canonical workspace root is the app's workspace record (`~/InnerLightAgency/workspaces/<project-id>/`), passed into the run trigger and realpath'd once at run start. The runtime never derives or guesses the root — this prevents the runtime and app from disagreeing about the boundary.
- **loop ↔ existing trace schema.** Trace writes reuse `trace_events` row shape via `append_trace_event`; `tool.executed` is a new `event_type` value, **not** a schema change. Packets reuse `packets`; artifacts reuse `artifacts`. No parallel telemetry store.

---

## 4. Implementation constraints (non-negotiable for Code Developer)

1. **Honest confinement posture for shell.** Do not enable any shell/install/deploy tool under software confinement. Shell requires the `os` `ConfinementProvider` (container or restricted OS user) first. Slice 1 ships no shell tool.
2. **Fail-closed gate + parent-check-then-open-once TOCTOU (Decision 2a.3).** Any gate exception = deny with `dependency_unavailable`. The loop cannot proceed past a non-`permit` verdict to the side effect. There is no nonce; path-bearing create/write/delete tools must, in order: (1) realpath the **parent** directory and re-assert containment **before** the create-open (`O_NOFOLLOW` does not refuse a junctioned ancestor; an `O_CREAT` open through one creates the file at the escape target before any post-open check can reject it), (2) open a handle once with no-follow semantics, (3) re-assert containment on the opened object, (4) write through the handle — never re-open a validated string by name. Failure of any of these → write nothing, `execution_error`. Software confinement leaves a residual parent-swap micro-window (2a.3a); the Docker `os` provider (Decision 8) is the kernel-level closure for shell roles.
3. **No service-role key in the desktop app.** The runtime's only DB credential is the logged-in user's Supabase session (held in main via `safeStorage`). The service-role key stays in `app/` server code. Privileged inserts go through `SECURITY DEFINER` RPCs (`search_path=''`).
4. **Reuse existing row shapes.** Use `trace_events`, `packets` (`packet_type` in its existing check list), `artifacts`, `workflow_runs.cost_usd` as-is. No new columns for slice 1; `tool.executed` lives in `payload`.
5. **Honor the three contracts verbatim.** Trace-emitter (append-only, monotonic seq, routing-decision-before-handoff, first causal break = first `verdict:block/error`); failure-packet (closed 7-type taxonomy, no silent empty output); loop-termination (`MAX_ORCHESTRATION_ITERATIONS=15`, never reset/suppress, loop detection). A change to any contract requires a governance amendment — do not edit the contract files.
6. **Test harness is a precondition.** `pnpm test` (vitest) in `runtime/` must exist and run the tape-driven loop deterministically before any loop logic is asserted "done."
7. **Cost is never silently zero.** The runtime pricing table must include `claude-opus-4-8` ($5/$25 per 1M); an unknown model is a configuration error, not a 0-cost run.
8. **Fault isolation in the host (main-process co-tenancy).** The loop runs inside Electron main, shared with IPC/UI. The run dispatch (`startRun`) must be wrapped so any loop exception becomes a `FAILURE PACKET` (`execution_error`) + the run marked failed in `workflow_runs` — it must **never** propagate to and crash the Electron main process or the UI. The loop must not block the IPC-handler hot path. `contextIsolation` must be on and no credential (BYOK key, Supabase session) may cross the IPC bridge to the renderer. (This applies once the loop is hosted in main — T5/T6 — but is written as a constraint now so the loop is built fault-isolated from the start.)

---

## 5. Vertical-slice task breakdown (brief §7 — what Build Coordinator routes)

One specialist (`code-developer`), one tool (`write_file`, workspace-scoped), the in-process gate, the manual loop — end to end, per-iteration trace with a real gate decision, run from the local process. Plus two negative slices. Tasks are ordered and independently implementable; each has a done-criterion.

| # | Task | Done-criterion |
|---|---|---|
| **T0** | Scaffold `runtime/` package + `pnpm test` vitest harness: injectable model client, tape fixture format, fake gate, ephemeral temp-workspace, trace/DB assertion helpers. | `pnpm --filter runtime test` runs and a trivial tape (1 turn, `end_turn`) passes green; harness can assert trace rows. |
| **T1** | `resolveWorkspace()` (realpath + containment) with table tests incl. symlink-escape and `..` cases. | Unit tests: in-boundary path resolves; symlink/`..` escape returns `outside_boundary`; no filesystem write occurs. |
| **T2** | `gate()` pure decision function + `grants.ts` matrix encoding for `code-developer`. | Table-driven tests over the grant matrix: T0 bypass, T3-in-grant→permit, T2-unmet→`blocked_with_path`, T1→`blocked_hard`, out-of-grant→`blocked_scope`. No I/O in `gate()`. |
| **T3** | `append_trace_event` RPC migration `0008` + `trace/emit.ts` writing `tool.executed` payload. | Migration applies; concurrent insert test shows no `seq` collision; a `tool.executed` row carries `capability`/`tier`/`gate_decision`. |
| **T4** | `software` `ConfinementProvider` + `write_file` tool (`W`,`T3`,`pathArg:'path'`) with the open-once/no-follow/handle-validation rule (Decision 2a). | `write_file` writes only inside the realpath'd root; a path outside is refused before `execute`; **symlink-swap negative test** (Decision 2a.5) produces no out-of-workspace file and an `execution_error`. |
| **T5** | Manual loop (`run-loop.ts`): SDK call, append `response.content`, `tool_use` handling, gate-before-side-effect, `tool_result` feedback, usage capture. | Happy-path tape: model requests `write_file` inside workspace → permit → file written → `end_turn`; `count(tool.executed)==count(tool calls)`. |
| **T6** | Electron `run:start` IPC handler + `db/client.ts` built from the logged-in Supabase user session (Decision 7); no loopback, no minted JWT, no service-role key. | Renderer invokes `run:start`; main validates the user is a member before dispatch; runtime writes trace/artifact rows **as the authenticated user under RLS**; a write to a non-member workspace is **rejected by RLS**; built artifact contains **no** service-role key (only the `safeStorage` session); gate/loop import nothing from `electron`. |
| **T7** | Budget + iteration-cap + loop-detection wiring with failure-packet emission. | (a) Non-terminating tape halts at iteration **15** with `timeout` packet + full trace. (b) Loop-detection tape halts with `timeout`/"loop detected". (c) Budget-overrun fixture halts with `scope_exceeded`; `cost_usd` non-null and = token×price. |
| **T8 (neg.)** | Escape tape: model requests `write_file` outside workspace; run twice — grant off and approved. | Grant-off: `blocked_hard`, **no** side effect, structured observation returned to model, `verdict:block` trace. Approved run proves the gate (not the tool) decides. |
| **T9 (liveness)** | Success-criterion #1 liveness check for the slice: the written artifact passes a defined smoke check, not "file exists." | A defined post-condition on the written file passes (e.g. content matches expected + non-empty); recorded as an `artifacts` row. |

This exercises every novel risk — loop, gate, confinement, tracing, cap, failure packet, local-process home — proving success criteria 2, 3, 4 (brief §6) with three tiny deterministic tests instead of one nondeterministic site build. It omits shell (needs OS isolation — Decision 8), web fetch, and the 5→28 expansion (brief §7).

---

## 6. Open risks / explicitly deferred

**Resolved since v1 (no longer open):**
- ~~Nonce re-check granularity~~ → **closed by Decision 2a** (in-process gate has no replayable permit; nonce removed; filesystem TOCTOU closed via the open-once handle rule in the tool).
- ~~Scoped-JWT claim shape + TTL~~ → **closed by revised Decision 7** (desktop holds a real Supabase user session; no minted token).
- Regression characterization sequencing → **resolved in BUILD_ROUTING** (snapshot taken before T6, the first `app/`-touching task; re-run green at DoD).

**Open risks (decide during implementation):**
- **Main-process co-tenancy** — **promoted to a hard constraint (§4.8).** No longer an open risk; enforced when the loop is hosted in main (T5/T6).
- **`tool_result` block schema stability.** The structured "blocked-with-path" block shape (Decision 5) is model-facing; if the model adapts poorly, the wording/shape may need iteration (functional, not architectural — handle inside T8).

**Explicitly deferred (brief §8, §9 — out of scope this phase):**
- Python Orin/OBEXGATE sidecar and the 88-engine compliance library; Ed25519 witness signing (fields logged now).
- OS-isolation provider implementation for shell roles (interface defined now; impl is the gate to enabling `SH`).
- Shell exec and web fetch tools; the 5→28 specialist expansion; sub-agent spawning (`parent ∩ requested` — grant is already passed as a parameter so it slots in without rework).
- Non-token spend ($10/run) hard-stop and connector-write tiers (no SPEND/CONw tools yet).
- Cloud sandbox (E2B), interactive browser automation, multi-tenant cloud deployment, UI beyond a minimal run+approval view.
- Migrating the `app/` read-max-then-+1 seq sites to the new RPC (runtime uses the RPC from day one; app migration is a follow-up, not a slice-1 blocker).

---

*End of ADR-001. Handoff: Build Coordinator → Code Developer, starting at T0.*
