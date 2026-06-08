# InnerLight Agency OS — Autonomous AI Agency on Your Desktop

**One-line:** Give it a complex brief; a 28-agent organization plans it, executes it on your machine, and proves every action was compliant.

---

## The Product Offering

A **Windows/Mac desktop application** (Electron) that runs a full autonomous AI agency locally. You type or speak a project brief — *"build a marketing site with a Supabase backend and a booking flow"* — and the system decomposes it, routes it through a hierarchical org of specialized agents, and **actually does the work**: writes code, runs commands, builds and tests software, browses the web, drafts content, and ships artifacts. Every action an agent takes is intercepted, evaluated against policy, permitted or blocked, and recorded as a cryptographic proof of compliance (the OBEXGATE Witness Tetrad).

Three things make it different from a chat assistant or from Manus.ai:
1. **It's an organization, not a single agent** — 28 specialized roles with enforced handoff discipline, QA gates, and a truth-verification layer.
2. **It runs on your machine** — Electron's main process gives native shell, filesystem, and process access. No rented cloud VM required for local work; your files, your tools, your control.
3. **Governance is in the execution path** — not a dashboard after the fact. Nothing risky happens without passing the enforcement gate, and every permitted action is witnessed and signed.

---

## What It Can Do (Capabilities)

| Capability | What that means in practice |
|---|---|
| **Build software** | Scaffold + write a website with backend, run the dev server, run tests, fix failures — full code lifecycle. |
| **Operate the machine** | Execute shell commands, manage files, run local tooling (git, package managers, build chains) with per-action approval. |
| **Browse & research** | Drive a real browser (Playwright), gather sources, verify claims, produce cited reports. |
| **Spawn specialists** | The orchestrator instantiates domain-specific agents on demand for whatever the brief requires. |
| **Go-to-market** | Draft content, marketing strategy, sales collateral, community responses — the Distribution layer. |
| **Learn & advise** | Analytics, experiments, customer-insight synthesis, strategy recommendations — the Learning layer. |
| **Govern itself** | Every action gated by OBEXGATE; loop limits, retry caps, and failure packets prevent runaway or silent failure. |
| **Prove compliance** | Each permitted action emits a signed Witness Tetrad (input + rule + decision + signature) — audit-ready. |

---

## The Components — Full Parity with the 28-Agent Org

Every conceptual agent in the Dream Team library has a real, executable counterpart in the desktop app (`src/main/agents/`). "Full parity" = one running module per role, same hierarchy, same contracts.

```
Central Orchestrator          classifies the brief, routes, gates Learning output
├── Research Coordinator   →  Research Analyst · Market Intelligence · Idea Generator · Knowledge Librarian
├── Build Coordinator      →  Architect → UX Designer → Code Developer → QA Testing → Truth Agent
├── Operate Coordinator    →  DevOps · Data Pipeline · Security · Performance Optimization
├── Distribution Coord.    →  Marketing Strategy · Content Creation · Sales Enablement · Community Manager
├── Learning Coordinator   →  Analytics · Customer Insight · Experimentation · Strategy Advisor
└── Distribution Packager     assembles deliverable bundles
```

**Three safety contracts run cross-cutting** (the same ones already in the library): failure-packet (no silent failures), trace-emitter (every handoff logged with monotonic sequence), loop-termination (hard cap of 15 iterations, bounded retries).

---

## How It's Built (Architecture)

```
┌─────────────────────────── DESKTOP APP (Electron) ───────────────────────────┐
│  Renderer (React/Tailwind)        ← brief input, live activity, approvals      │
│        │ IPC                                                                    │
│  Main process (Node)              ← THE EXECUTION ENGINE                        │
│   ├─ Agent runtime (28 roles)     ← orchestrator → coordinators → specialists  │
│   ├─ Tool loop                    ← pick action → execute → observe → repeat    │
│   ├─ Native tools                 ← shell · filesystem · process · Playwright   │
│   ├─ Anthropic SDK                ← the model brain (Claude)                    │
│   └─ Local cache (SQLite)         ← fast local state                           │
│        │                                                                        │
│        ├──▶ every action ──▶ OBEXGATE / Orin (enforcement sidecar)             │
│        │                       permit / block + signed Witness Tetrad           │
│        ▼                                                                        │
│  Supabase (backend)               ← tickets, traces, artifacts, auth, RLS       │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Brain:** Anthropic Claude via `@anthropic-ai/sdk` (already a dependency).
- **Execution:** Electron main process — native computer access; optional E2B/cloud sandbox for untrusted or parallel work.
- **Backend:** Supabase (tickets, traces, artifacts, auth, row-level security) with a local SQLite cache for speed.
- **Enforcement:** Orin runs as a sidecar service; the tool loop calls its gate at every action boundary. Reuse, don't rebuild.

---

## Parity Scorecard vs. Manus.ai

| Dimension | Manus.ai | InnerLight Agency OS |
|---|---|---|
| Compute substrate | Rented cloud microVM | Your own machine (Electron) + optional cloud sandbox |
| Agent model | planner / executor (context isolation) | 28-role org with enforced contracts |
| Tool loop | ✅ ~50 calls/task | **To build** — main-process loop |
| Browser / shell / files | ✅ | Native via Node + Playwright — **to wire** |
| Autonomy trigger | ✅ | **To build** — scheduler/queue |
| Governance / proof | ✗ | ✅ OBEXGATE enforcement + signed proof (the moat) |

**Status:** brain ✅, org scaffold ✅, backend ✅, desktop shell ✅. To build: the tool-execution loop, native tool wiring, the Orin enforcement call, and an autonomous trigger. The hard, differentiating half — a governed, organization-shaped agent that proves its compliance — is what's already uniquely yours.
