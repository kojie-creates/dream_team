# Project Brief — Dream Team Executable Core

**Status:** Draft for audit
**Date:** 2026-06-06
**Owner:** Felix Montanez

---

## 1. Objective

Make the Dream Team **autonomous and executable** — able to take a complex project brief (e.g., "build a marketing site with a Supabase backend and a booking flow"), decompose it, run domain-specialized agents that **actually do the work** (write code, run commands, build/test software, browse), and ship artifacts — with capabilities comparable to Manus.ai, but governed.

This brief covers **only the executable core + tool-use loop + the software-sandbox wiring.** Topology (desktop/local runtime) is treated as decided. Governance design is already specified separately ([GOVERNANCE_SPEC.md](GOVERNANCE_SPEC.md)).

---

## 2. Verified Current State (ground truth, personally confirmed in source)

- The 28 "agents" are **markdown prompt files** rendered in a catalog UI ([app/src/lib/agents/catalog.ts](../app/src/lib/agents/catalog.ts)). None execute.
- One real model call exists: brief **classification** ([app/src/lib/model/provider.ts](../app/src/lib/model/provider.ts), called at [orchestration.ts:125](../app/src/app/actions/orchestration.ts#L125)).
- The "specialist pass" is a **deterministic template** — first line as title, first 5 lines as bullets, static markdown ([orchestration.ts:1462-1478](../app/src/app/actions/orchestration.ts#L1462-L1478)). `model: 'deterministic/t3'`, 0 tokens.
- Only 5 of 28 specialists are referenced, by name only, in a hardcoded map ([orchestration.ts:1436-1442](../app/src/app/actions/orchestration.ts#L1436-L1442)). They do not run.
- QA + Truth = deterministic checks (`deterministic/t4`).
- **Zero execution primitives** anywhere in `src/`: no child_process/spawn/exec/playwright/puppeteer/e2b/tool definitions. Only `tool_use: true` = the human-confirmed Google Calendar write ([connectors.ts:358](../app/src/app/actions/connectors.ts#L358)).

**Conclusion:** the system is a governance/trace skeleton with a classifier. The entire executable core is to-build.

---

## 3. Topology (decided)

- **Execution runs in a persistent local process**, not the Next.js serverless app. A 50-iteration tool loop cannot live in a request/response server action (timeouts). The local runtime is the executor.
- **Native local execution** (shell, filesystem, browser) is the compute substrate — no cloud VM required for the common case. Optional cloud sandbox (e.g., E2B) reserved for untrusted or parallel work.
- **Critical correction:** native local access is the *substrate*, NOT isolation. It runs on the user's real machine = max blast radius. The "sandbox" property must be reconstructed in software (§4, item 3).
- **Backend:** Supabase (tickets, traces, artifacts, auth, RLS), as today.
- **Enforcement:** Orin / OBEXGATE as a sidecar service the loop calls at each action boundary.

---

## 4. Scope — What to Build

1. **Tool-use loop.** Model call with tools → parse tool calls → execute → feed observations back → repeat until done or capped. Replaces the deterministic specialist stub. Per-iteration trace + token/cost accounting.
2. **Tool set, wired to native APIs.** Minimum: file read/write (workspace-scoped), shell exec (workspace-scoped). Next: web fetch / browser-read. Each tool returns structured observations.
3. **Confinement + gate call (the software sandbox).** Every tool call, before executing, checks: (a) workspace-boundary confinement, (b) the Orin tier gate per [GOVERNANCE_SPEC.md](GOVERNANCE_SPEC.md) (T0 log-only … T1 hard-gate+approval). This is the isolation desktop does NOT provide for free.
4. **Specialists become real.** Each of the 28 prompt files becomes the system prompt for a loop instance. Expand the hardcoded 5→28 routing.
5. **Loop bounding.** Wire the existing loop-termination contract (`MAX_ORCHESTRATION_ITERATIONS = 15`, retry caps) into the loop. Emit failure packets on cap.

---

## 5. Non-Goals (this phase)

- Cloud sandbox (E2B) integration — optional, deferred.
- Full browser automation — read-only fetch first; interactive browser later.
- The 88-engine OBEXGATE compliance library — integrate the gate mechanism, not the full jurisdiction set.
- UI/visual screens beyond a minimal run view.
- Multi-tenant cloud deployment of the executor.

---

## 6. Constraints

- Must honor the three contracts (failure-packet, trace-emitter, loop-termination) — already canonical in `contracts/`.
- Must honor [GOVERNANCE_SPEC.md](GOVERNANCE_SPEC.md) capability grants + tier defaults (safe-by-default; T1 powers off until granted per project).
- Reuse Orin as a service; do **not** port its 81KB Python gate to TypeScript.
- Simplicity-first: minimum code that produces a working governed loop. No speculative abstraction.

---

## 7. Success Criteria

1. A real brief ("build a static site with a contact form backed by Supabase") runs end-to-end: orchestrator classifies → build specialist(s) run a tool loop → files are written to a workspace dir → tests/build run via shell → a working artifact exists on disk.
2. Every tool call produced a trace event with a real gate decision (not `tool_use: false` plumbing).
3. At least one T1 action (e.g., a write outside the workspace, or a deploy) was **blocked** without explicit approval — proving the software sandbox works.
4. The loop terminated cleanly (completed or hit the 15-cap with a failure packet), never ran unbounded.
5. Token/cost recorded per run.

---

## 8. Open Questions / Risks

1. **Loop engine:** Claude Agent SDK (native sub-agent spawn, tool loop, MCP) vs hand-rolled loop on `@anthropic-ai/sdk`. Tradeoffs?
2. **Where does the local runtime live** given the desktop scaffold is reference-only? New standalone local service, or revived from the existing Next.js app as a separate worker?
3. **Orin packaging** as a sidecar (Python runtime distribution, spawn model, call contract).
4. **Workspace confinement enforcement** — is a path-prefix check sufficient, or is OS-level sandboxing (containers, restricted user) needed to be safe on a real machine?
5. **Specialist→tool mapping** — do all 28 get the same tool set, or per-role tool grants (per the capability matrix)?
6. **Sub-agent spawning** — does a specialist spawn its own sub-agents, and how is grant-subset inheritance enforced?
