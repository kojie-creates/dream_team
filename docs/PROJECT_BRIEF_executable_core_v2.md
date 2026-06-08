# Project Brief v2 — Dream Team Executable Core

**Status:** Revised after specialist audit (Architect, Security, QA, DevOps)
**Supersedes:** PROJECT_BRIEF_executable_core.md (v1)
**Date:** 2026-06-06
**Owner:** Felix Montanez

> **What changed from v1:** four specialists audited v1. Security returned *unacceptable as designed* on one point — the "software sandbox via path-prefix check." This v2 folds in every accepted finding. Headline changes: (1) OS-level isolation is **required** for any shell/install/deploy role, not deferred; (2) the enforcement gate is an **in-process TypeScript decision function** for v1, not a Python sidecar; (3) the build is **re-sequenced — gate and confinement first**, loop second; (4) a **test harness is a precondition**, not an afterthought.

---

## 1. Objective (unchanged)

Make the Dream Team autonomous and executable — take a complex brief, decompose it, run domain-specialized agents that actually do the work (write code, run commands, build/test, browse), and ship artifacts. Comparable to Manus.ai, but **governed** — every action checked against policy and recorded as proof.

---

## 2. Verified Current State (ground truth, confirmed in source)

- The 28 "agents" are markdown prompt files in a catalog UI ([catalog.ts](../app/src/lib/agents/catalog.ts)). None execute.
- One real model call: brief classification ([provider.ts](../app/src/lib/model/provider.ts), used at [orchestration.ts:125](../app/src/app/actions/orchestration.ts#L125)).
- The "specialist pass" is a deterministic template ([orchestration.ts:1462-1478](../app/src/app/actions/orchestration.ts#L1462-L1478)), `model: 'deterministic/t3'`, 0 tokens.
- Zero execution primitives in `src/` (no child_process/spawn/exec/playwright/e2b). Only `tool_use: true` = the human-confirmed Calendar write.
- **Orin/OBEXGATE is NOT in this repo** — only the pitch decks (`.obexgate_deck_*.txt`). Orin's Python code lives in the separate `Desktop/Orin` folder. v1's "reuse Orin as a service" assumed an integration that doesn't exist here.
- **No application-level test runner exists** — only pgTAP (RLS) + static smoke scripts. No vitest/jest, no `pnpm test`.

---

## 3. Topology (decided, with audit corrections)

- Execution runs in a **persistent local process**, not the Next.js serverless app (a long loop can't live in a request/response server action).
- **Critical, from Security audit:** native local access is the *substrate*, NOT isolation. A path-prefix check is **not a sandbox** — once a role has shell, it walks around any in-process path check (symlinks, `cd ..`, `$(...)`, subprocess spawn, `npm` postinstall).
  - Read-only / no-shell roles → software confinement (canonicalized path check) is adequate.
  - **Any role with shell / dependency-install / deploy → OS-level isolation is REQUIRED** (container, or a restricted OS user with filesystem ACLs). This replaces v1 §5's "cloud sandbox optional, deferred."
- **Backend:** Supabase (tickets, traces, artifacts, auth, RLS), as today.
- **Enforcement gate (v1 build):** an **in-process TypeScript decision function** implementing the GOVERNANCE_SPEC decision tree (~100 lines: tier lookup → grant intersection → permit/blocked-with-path/blocked-hard). The Python Orin sidecar is deferred to a later phase when OBEXGATE ships as a separately-deployed product. The Witness Tetrad fields are *logged* now; Ed25519 signing added later.

---

## 4. Scope — re-sequenced (gate and confinement FIRST)

**0. Test harness (precondition).** `pnpm test` via vitest; an injectable model client + "tape" fixture format (scripted tool-call transcripts) for deterministic loop runs; a fake in-process gate; an ephemeral temp-workspace per test; trace/DB assertion helpers. *Nothing below is verifiable without this.*

**1. Gate decision function + workspace confinement.** Pure-logic TypeScript gate over the GOVERNANCE_SPEC tiers/grants. Path canonicalization (`fs.realpath` + post-resolution containment assert), not string prefix. Two composable, unit-testable functions: `resolveWorkspace(path)` and `gate(action, role, tier, boundary)`. Table-driven tests over the grant matrix.

**2. Tool-use loop (manual).** A hand-rolled `while (stop_reason !== 'end_turn')` loop on `@anthropic-ai/sdk` — owns every iteration boundary (where traces, the 15-cap, cost accounting, and gate calls live). The gate is called **synchronously inside the tool boundary, before the side effect**; a block returns a `tool_result` carrying the "what's missing" path so the model can adapt. (Not the beta tool-runner — it hides the seam we must instrument. Not Managed Agents — they run Anthropic-side, contradicting local execution.)

**3. Tool set, wired to native APIs.** First: `write_file` (workspace-scoped). Then: shell exec (**behind OS isolation per §3**), then web fetch. Each returns structured observations.

**4. Atomic sequence allocation.** Replace read-max-then-+1 seq allocation (collides under per-iteration + sub-agent concurrency) with a `SECURITY DEFINER` RPC doing `INSERT ... RETURNING seq` under a lock. Keep the `unique(ticket_id, seq)` backstop.

**5. RLS-safe writes.** The local process must NOT hold the raw service-role key as identity. Either the app mints a scoped per-run token bound to `workspace_id`+`runId`, or the worker writes back through the app over loopback. RLS stays enforced.

**6. Specialists become real (last — it's data, not engineering).** Each prompt file becomes a loop instance's system prompt; per-role tool grants loaded from the GOVERNANCE_SPEC matrix; expand the hardcoded 5→28 routing. Sub-agent spawning deferred, but pass the grant as a parameter into the loop instance so `parent ∩ requested` can be added later without rework.

**7. Loop bounding.** Wire the loop-termination contract (`MAX_ORCHESTRATION_ITERATIONS = 15`, retry caps) and budget hard-stops (GOVERNANCE_SPEC §8.2) as enforced halts emitting failure packets — not just telemetry.

---

## 5. Security must-fixes before ANY native execution ships

(From the Security audit — all three are blocking for shell-capable roles.)

1. **OS boundary for `SH`/install/deploy** — container or restricted OS user with kernel-enforced filesystem + network limits. Host-native shell governed only by a path check does not ship.
2. **Gate is fail-closed, signature-verified, TOCTOU-safe** — no gate response = deny (`dependency_unavailable`); permits bound to the exact canonicalized action + nonce; the agent cannot kill or spoof the gate.
3. **Default-deny outbound network + credential isolation** — route traffic through a logging proxy with a per-project domain allowlist (catches GET/DNS exfil); run as a low-privilege user with a scrubbed environment and no access to `~/.ssh`, `~/.aws`, browser profiles, keychains. Secrets via OS keychain, never plaintext `.env` the loop can read.

---

## 6. Success Criteria (tightened per QA audit)

1. A golden brief runs end-to-end and produces a **working** artifact — defined per task as a *liveness check*, not just files on disk (e.g., build exits 0 **and** a defined smoke check passes), not "files exist."
2. Every tool call → a `tool.executed` trace event carrying `capability`, `tier`, and `gate_decision`. Assert `count(tool events) == count(tool calls)`.
3. A forced T1 action (write outside workspace, via fixture tape) is **blocked**: no side effect, `blocked_hard` recorded, loop gets a structured observation. Run twice — grant off (block) and approved (permit) — to prove the gate decides.
4. A forced non-terminating tape halts at exactly iteration 15 with a `timeout` failure packet and full trace. Separate fixture for the loop-detection rule.
5. Budget overrun (fixture) halts with a `scope_exceeded` failure packet. Token/cost recorded per run, non-null, consistent with token×price.
6. Regression: existing classification + the deterministic-pass DB side-effect shape + pgTAP RLS suites stay green (characterization snapshot taken before the swap).

---

## 7. First vertical slice (the de-risking build)

> **One specialist (`code-developer`), one tool (`write_file`, workspace-scoped), the in-process gate, the manual loop — end to end, per-iteration trace with a real gate decision, run from the local process.** Plus two negative slices: a tape that escapes the workspace (must `blocked_hard`); a tape that never terminates (must hit the 15-cap with a `timeout` packet).

This exercises every novel risk — loop, gate, confinement, tracing, cap, failure packet, local-process home — while omitting shell (needs OS isolation first), web fetch, and the 5→28 expansion. Proves success criteria 2, 3, 4 with three tiny deterministic tests instead of one nondeterministic site build.

---

## 8. Resolved decisions (were open in v1)

| v1 open question | Resolution |
|---|---|
| Agent SDK vs hand-rolled loop | **Manual loop** on `@anthropic-ai/sdk`. No standalone "Agent SDK" exists; the beta tool-runner hides the seam; Managed Agents run server-side. |
| Where the runtime lives | **Separate Node/TS process** (`runtime/` sibling to `app/`), triggered by the app via loopback; communicates state through Supabase. Not a Next.js worker, not the reference desktop scaffold. |
| Orin sidecar packaging | **Deferred.** Gate is in-process TS for v1. (If reintroduced: loopback HTTP, fail-closed, PyInstaller-bundled, runs as a user the agent can't kill.) |
| Path-prefix vs OS sandbox | **Both, by role:** canonicalized path check for no-shell roles; **OS isolation required** for shell/install/deploy. |
| Per-role tool grants | **Yes**, loaded from the GOVERNANCE_SPEC matrix when a specialist instantiates. |
| Sub-agent spawning | **Deferred**, but the grant is passed as a parameter so `parent ∩ requested` slots in later. |

---

## 9. Non-goals (this phase)

Cloud sandbox (E2B) integration; interactive browser automation; the 88-engine OBEXGATE compliance library; the Python Orin sidecar; UI beyond a minimal run+approval view; multi-tenant cloud deployment.
