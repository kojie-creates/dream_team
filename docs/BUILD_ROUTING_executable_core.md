# BUILD ROUTING PLAN — Executable Core (Vertical Slice 1)

**From:** Build Coordinator
**To (final handoff):** Central Orchestrator
**Source of truth:** `docs/ADR-001-executable-core.md` (Decisions 1–10, §3 boundaries, §4 constraints, §5 task table, §6 risks)
**Brief:** `docs/PROJECT_BRIEF_executable_core_v2.md`
**Scope:** ADR §5 tasks T0–T9 only. Shell, web fetch, sub-agent spawning, OS-isolation impl, and the 5→28 expansion are **out of this slice** (ADR §6 deferred).

---

## 1. Routing overview — who is involved and why

| Specialist | Involvement | Why |
|---|---|---|
| **Architect** | Done (authored ADR-001); on-call for clarification only | All design encoded in ADR. Re-engaged only for two in-flight calls: nonce re-check granularity (T5), scoped-JWT claim shape/TTL (T6), and to ratify the regression-snapshot sequencing. |
| **UX Designer** | Not involved | Slice 1 is a headless runtime + loopback trigger. UI is capped at a minimal run+approval view (brief §9), out of this de-risking slice. |
| **Code Developer** | Primary owner of T0–T9 | Every task is implementation. ADR §4 is addressed to this role. |
| **QA / Testing** | Heavy, continuous; gates after each stage | The slice's justification is "three tiny deterministic tests, not one nondeterministic site build." Owns negative/liveness verification (T7–T9) and cross-cutting acceptance criteria. |
| **Truth Agent** | End of slice only | Validates QA-passed claims are evidence-backed before reaching Central Orchestrator. |

**Net:** Code-Developer-heavy, QA-gated slice; no UX; Architect consultation-only; single Truth Agent pass at the end.

---

## 2. Sequenced work plan (HANDOFF PACKETS, dependency order)

Ordering respects the ADR's hard rules: test harness first (T0); gate + confinement before the loop (T1, T2, T4 before T5); shell stays out; 5→28 last (out of slice). T3 (atomic seq + trace emit) precedes T5 because the loop emits `tool.executed` through the RPC.

### HANDOFF PACKET — T0
```
Task id: T0
Owner: Code Developer
Inputs: ADR Decision 1, §3 boundaries (runtime/test/harness/, model/client.ts injectable), constraint §4.6, brief §4.0.
Work: Scaffold runtime/ package (deps @anthropic-ai/sdk, @supabase/supabase-js, vitest, zod). Build vitest harness: injectable model client, "tape" fixture format, fake in-process gate, ephemeral temp-workspace per test, trace/DB assertion helpers.
Done-criterion: "pnpm --filter runtime test runs and a trivial tape (1 turn, end_turn) passes green; harness can assert trace rows."
QA gate: YES — precondition gate.
Unblocks: T1,T2,T3,T4,T5,T7,T8,T9.
```

### HANDOFF PACKET — T1
```
Task id: T1
Owner: Code Developer
Inputs: ADR Decision 2 (resolveWorkspace/WorkspaceResolution), §3 (gate/workspace.ts), constraint §4.2, Decision 8.
Work: resolveWorkspace(requestedPath, boundary): realpath-resolve then assert containment. NOT string-prefix. Table tests incl. symlink-escape and ".." cases.
Done-criterion: "in-boundary path resolves; symlink/.. escape returns outside_boundary; no filesystem write occurs."
QA gate: YES.
Unblocks: T2, T4, T5. Parallelizable with T2, T3 after T0.
```

### HANDOFF PACKET — T2
```
Task id: T2
Owner: Code Developer
Inputs: ADR Decision 2 (gate() signature, GateDecision union, §5/§6 decision flow), Decision 9 (grants.ts for code-developer), constraints §4.2 (fail-closed), §4.5.
Work: Pure gate() (total, sync, no I/O/clock) + grants.ts. T0 bypass, blocked_scope (out-of-grant), T3-in-grant permit, T2 permit-or-blocked_with_path, T1 permit-only-with-standing-grant+approval else blocked_hard. Carry nonce.
Done-criterion: "Table-driven tests: T0 bypass, T3-in-grant→permit, T2-unmet→blocked_with_path, T1→blocked_hard, out-of-grant→blocked_scope. No I/O in gate()."
QA gate: YES.
Unblocks: T5, T8. Parallelizable with T1, T3 after T0.
```

### HANDOFF PACKET — T3
```
Task id: T3
Owner: Code Developer
Inputs: ADR Decision 6 (append_trace_event RPC, migration 0008, SECURITY DEFINER + search_path='' per 0003), Decision 4 (tool.executed payload), constraints §4.3, §4.4.
Work: Add app/supabase/migrations/0008_atomic_trace_seq.sql. Implement runtime/src/trace/emit.ts via the RPC. Keep unique(ticket_id, seq) backstop.
Done-criterion: "Migration applies; concurrent insert test shows no seq collision; a tool.executed row carries capability/tier/gate_decision."
QA gate: YES.
Unblocks: T5, T7, T9. Parallelizable with T1, T2 after T0.
```

### HANDOFF PACKET — T4
```
Task id: T4
Owner: Code Developer
Inputs: ADR Decision 5 (ToolDef/ToolObservation; loop calls gate, not tool), Decision 8 (software ConfinementProvider; NO shell tool), Decision 2, §3 (confine/provider.ts, tools/write-file.ts, tools/types.ts).
Work: Software ConfinementProvider (realpath'd workspaceRoot()) + write_file tool (capability 'W', actionTier 'T3', pathArg 'path'). Confinement enforced before execute().
Done-criterion: "write_file writes only inside the realpath'd workspace root; a path outside is refused before execute."
QA gate: YES.
Unblocks: T5, T9. Depends on T1, T0.
CONSTRAINT FLAG: No shell/install/deploy tool in this slice (§4.1, Decision 8). Software confinement acceptable ONLY because no shell tool is enabled.
```

### HANDOFF PACKET — T5
```
Task id: T5
Owner: Code Developer
Inputs: ADR Decision 3 (manual loop: messages.create → usage/cost → append response.content verbatim → tool_use: resolveWorkspace → gate → emit → permit+nonce-valid → executeTool else structured block → tool_result), Decisions 4,5, constraint §4.2. Model: claude-opus-4-8.
DEPENDS ON DONE+QA-PASSED: T1,T2,T3,T4.
Work: run-loop.ts: SDK call, append response.content verbatim, tool_use handling, gate-before-side-effect, one tool_result per tool_use id, usage capture.
Done-criterion: "Happy-path tape: write_file inside workspace → permit → file written → end_turn; count(tool.executed)==count(tool calls)."
QA gate: YES.
Unblocks: T7, T8, T9.
RESOLVED (was "nonce re-check"): ADR Decision 2a — no nonce (in-process gate); step 4d is a bare permit check. TOCTOU folds into T4.
```

### HANDOFF PACKET — T6
```
Task id: T6  (REVISED 2026-06-07 for Electron)
Owner: Code Developer
Inputs: ADR Decision 1 (runtime in Electron main; renderer→main IPC), Decision 7 revised (logged-in Supabase user session via safeStorage; no minted JWT, no service-role key), §3 (runtime/src/host/electron-adapter.ts; runtime/src/db/client.ts), constraint §4.3.
Work: Electron run:start IPC handler (validates user is a workspace member before dispatch); db/client.ts built from the logged-in user session loaded from safeStorage. No loopback HTTP, no minted JWT.
Done-criterion: "Renderer invokes run:start; main validates membership; runtime writes trace/artifact rows AS the authenticated user under RLS; a write to a non-member workspace is rejected by RLS; built artifact has no service-role key (only safeStorage session); gate/loop import nothing from electron."
QA gate: YES. Run after T3; can overlap T5.
RESOLVED (was "scoped-JWT claim/TTL"): superseded — desktop holds a real user session, no token to mint.
```

### HANDOFF PACKET — T7
```
Task id: T7
Owner: Code Developer
Inputs: ADR Decision 10 (iteration cap 15 before every messages.create; loop detection on identical from/to + no state change; budget soft-warn $5 / hard-stop $20; cost in workflow_runs.cost_usd; claude-opus-4-8 pricing $5/$25 per 1M), constraints §4.5, §4.7, §3 (loop/budget.ts, loop/terminate.ts, packets/failure.ts).
DEPENDS ON DONE+QA-PASSED: T5, T3.
Work: Wire iteration cap, loop detection, budget hard-stops as enforced halts emitting FAILURE PACKET rows + verdict:error trace at the first causal break. Add claude-opus-4-8 to runtime pricing table.
Done-criterion: "(a) Non-terminating tape halts at iteration 15 with timeout packet + full trace. (b) Loop-detection tape halts with timeout/'loop detected'. (c) Budget-overrun fixture halts with scope_exceeded; cost_usd non-null and = token×price."
QA gate: YES.
Unblocks: slice DoD.
```

### HANDOFF PACKET — T8 (negative)
```
Task id: T8
Owner: Code Developer (fixtures) / QA Testing (verdict)
Inputs: ADR Decision 2/5, brief §6.3 (forced T1 blocked, run twice).
DEPENDS ON DONE+QA-PASSED: T2, T4, T5.
Work: Escape tape — write_file OUTSIDE the workspace. Run twice: (1) grant off → blocked_hard, NO side effect, structured observation, verdict:block trace. (2) approved → permit, proving the GATE (not the tool) decides.
Done-criterion: "Grant-off: blocked_hard, no side effect, structured observation returned to model, verdict:block trace. Approved run proves the gate (not the tool) decides."
QA gate: YES — QA confirms NO file appeared on disk (evidence, not assertion).
Unblocks: slice DoD.
```

### HANDOFF PACKET — T9 (liveness)
```
Task id: T9
Owner: Code Developer (check) / QA Testing (verdict)
Inputs: ADR §5 T9, brief §6.1 (liveness, not "file exists"), Decision 4/§3 (artifacts row reuse).
DEPENDS ON DONE+QA-PASSED: T4, T5.
Work: Success-criterion-#1 liveness check: defined post-condition on the written file (content matches expected + non-empty), recorded as an artifacts row — NOT merely "file exists."
Done-criterion: "A defined post-condition on the written file passes; recorded as an artifacts row."
QA gate: YES.
Unblocks: slice DoD → Truth Agent.
```

### Regression characterization — sequencing call (ADR §6 open item)
Not a numbered task. **Routing decision:** the brief §6.6 characterization snapshot (existing classification + deterministic-pass DB side-effect shape + pgTAP RLS) is captured **at the start of the slice, before T6 touches `app/`**, and re-run as the final regression gate. T6 is the first task that modifies `app/`. Owner: QA Testing. No app behavior is swapped in this slice — guardrail, not migration.

---

## 3. Critical path + parallelization

**Critical path (longest chain):**
```
T0 (harness)
  → T1 (resolveWorkspace) ─┐
  → T2 (gate)              ├─ feed T5; T1 also gates T4
  → T3 (RPC + emit)       ─┘
  → T4 (confinement + write_file)  [needs T1]
  → T5 (manual loop)               [needs T1,T2,T3,T4 done+QA-passed]
  → T7 (cap/budget/failure)        [needs T5,T3]
  → T8 + T9 (negative + liveness)  [need T5; T8 needs T2; T9 needs T4]
  → slice DoD → Truth Agent → Central Orchestrator
```
**Single longest chain:** `T0 → T1 → T4 → T5 → T7 → (T8/T9) → DoD`. T1 gates both T4 and T5 → highest-leverage early task after the harness.

**No inter-task blocking after T0:** T1, T2, T3 mutually independent (T2 only needs the `WorkspaceBoundary` *type*, not T1 behavior). T6 is mostly app/index plumbing, can overlap T5 (done-criterion needs T3). Regression snapshot runs alongside T0–T5, must finish before T6.

**Strictly sequential:** T4 after T1; T5 after T1+T2+T3+T4; T7 after T5; T8/T9 after T5.

---

## 4. Gate checks between stages (QA acceptance criteria)

QA must PASS before the next dependent task starts. **QA failures return to Code Developer within the Build layer with evidence — they do not escape to Central Orchestrator.**

| Gate | QA must verify | Brief criterion |
|---|---|---|
| **G0 (T0)** | `pnpm --filter runtime test` runs; trivial 1-turn `end_turn` tape green; harness asserts trace rows. Hard precondition. | §4.0 |
| **G1 (T1)** | In-boundary resolves; symlink-escape and `..` → `outside_boundary`; no filesystem write during resolution. | §6.3 |
| **G2 (T2)** | Matrix table tests: bypass/permit/blocked_with_path/blocked_hard/blocked_scope; `gate()` no I/O. | §6.2/§6.3 |
| **G3 (T3)** | Migration 0008 applies; concurrent-insert test shows no `seq` collision; `tool.executed` carries capability/tier/gate_decision. | §6.2 |
| **G4 (T4)** | `write_file` writes only inside realpath'd root; outside refused before `execute`; no shell tool. | §6.1/§6.3 |
| **G5 (T5)** | Happy-path tape → permit → file written → `end_turn`; `count(tool.executed)==count(tool calls)` (assert exactly). | §6.2 |
| **G6 (T6)** | Runtime writes rows under RLS as a member; service-role key absent from runtime env. | §5.3 |
| **G7 (T7)** | (a) Non-terminating tape halts at exactly iteration 15 with `timeout` + full trace. (b) Loop-detection halts. (c) Budget overrun → `scope_exceeded`; `cost_usd` non-null = token×price (never silently zero). | §6.4, §6.5 |
| **G8 (T8)** | Grant-off: `blocked_hard`, no side effect on disk (QA inspects temp workspace), structured observation, `verdict:block`. Approved: permit — gate (not tool) decides. | §6.3 |
| **G9 (T9)** | Liveness post-condition passes (content + non-empty), not "file exists"; `artifacts` row recorded. | §6.1 |
| **G-REG (before T6 + at DoD)** | Classification + deterministic-pass DB shape + pgTAP RLS stay green; snapshot before any `app/` change. | §6.6 |

**QA-failure routing:** QA returns a `FAILURE PACKET` (likely `quality_gate_fail`) with reproducing evidence to Code Developer; the dependent task does not start. Specialists get 1 retry (loop-termination contract) before Build Coordinator escalates.

---

## 5. Definition of Done — whole slice

Complete and ready for **Truth Agent** when all hold:
1. Harness (T0/G0) deterministic, tape-driven.
2. Confinement (T1/G1) rejects symlink/`..` with no write.
3. Gate (T2/G2) correct across matrix, no I/O.
4. Trace + atomic seq (T3/G3): RPC applied, no collision, payload carries capability/tier/gate_decision.
5. Tool + provider (T4/G4): writes only inside root; outside refused; no shell tool.
6. Loop (T5/G5): happy path end-to-end; count==count.
7. RLS + credential isolation (T6/G6): writes as member; service-role key absent.
8. Bounding + budget (T7/G7): halts at exactly 15 with timeout+trace; loop-detection halts; budget overrun → scope_exceeded; cost consistent.
9. Negative escape (T8/G8): outside write blocked_hard, no side effect; approved permits.
10. Liveness (T9/G9): post-condition passes; artifacts row recorded.
11. Regression (G-REG): suites green; snapshot taken before any `app/` change.

When 1–11 QA-PASSED → route to **Truth Agent** (verify: "halts at exactly 15," "no side effect on blocked run," "service-role key absent," "count==count" are evidence-backed). **Do not hand to Central Orchestrator until Truth Agent returns Pass.**

---

## 6. Risks / blockers to flag upward

**Architect decisions — now RESOLVED (2026-06-07), no longer blockers:**
1. ~~Nonce re-check granularity~~ → **ADR Decision 2a**: in-process gate, no nonce; filesystem TOCTOU closed by the open-once handle rule, folded into T4 (adds a symlink-swap negative test).
2. ~~Scoped-JWT claim shape + TTL~~ → **ADR Decision 7 revised**: desktop holds a real Supabase user session; no minted token. T6 rewritten to Electron IPC + user-session client.
3. **Regression sequencing** — snapshot before T6 (first `app/`-touching task), green re-run at DoD. Settled.

**New (from the Electron move):** main-process co-tenancy hardening (loop crash must not kill main/UI; loop off the IPC hot path; `contextIsolation` on) — implementation-level, handled in T5/T6.

**Decisions for the NEXT slice (flag now, not blockers):**
4. **OS-isolation mechanism** (ADR Decision 8, §6) — container vs restricted OS user + default-deny outbound proxy. Hard gate to enabling shell. Needs Architect + Operate/DevOps + Security before any shell tool is routed.
5. **`app/` read-max-then-+1 seq migration** (ADR §6) — runtime uses RPC day one; ~8 existing `orchestration.ts` sites still collide; follow-up debt.
6. **`tool_result` block schema stability** — model-facing "blocked-with-path" wording may need iteration; handle in T8.

**Environmental note:** `@anthropic-ai/sdk` is a new dependency for `runtime/`; `claude-opus-4-8` pricing ($5/$25 per 1M) must be added to the runtime pricing table — unknown model = config error, not a 0-cost run (§4.7).

---

## Boundaries honored
Routing and sequencing only — no architecture, code, designs, or tests authored. All tasks verbatim from ADR §5 (T0–T9). QA failures stay in the Build layer. Truth Agent validates before handoff to Central Orchestrator.
