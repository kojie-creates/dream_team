# AI Dream Team

**28 AI agents that work together like a real company.**

One orchestrator routes work. Five coordinators manage their teams. Twenty specialists do the domain work. Truth Agent validates completed claims. Distribution Packager assembles deployable bundles. Three contracts keep everything from breaking silently.

---

## What Is This?

Each `.md` file in this project is a complete system prompt for one AI agent. Copy it into any LLM (ChatGPT, Claude, Gemini, Llama, etc.) and that agent knows its job, its boundaries, and how to hand work off.

Put all 26 together and you have a full AI organization that can research, build, deploy, market, and learn — with built-in failure handling so nothing fails silently.

---

## Product Architecture Intent

This repository is intended to be an **independent agentic operating team product**, not an Orin submodule. Some ticketing ideas and implementation patterns were borrowed from Orin because they already worked well, but the Dream Team should stand on its own.

Supabase is the current default work-queue and ticket persistence layer because it proved easier to query and operate than Notion or a Markdown `work_queue.md` file. Supabase should be treated as a practical default adapter, not the identity of the system. A future standalone package may either ship its own minimal ticketing client or support a "bring your own ticket backend" interface.

The larger product vision includes:

- a dashboard interface for ticket status, active work, project flows, deadlines, and daily briefs
- automation under the hood that can route, advance, pause, and close tickets according to policy
- integrations with productivity tools such as Gmail, Google Calendar, Google Drive, Slack, GitHub, and other work systems
- traceable project flows where the user can see what is being worked on, by which agent, with what blocker or next action
- scheduled daily briefs that summarize tickets, deadlines, calendar context, inbox signals, and recommended next actions

The agent prompts in this repository define the actor and contract layer. Runtime automation, dashboard UI, tool connectors, and input adapters are separate deployable layers that may live alongside this repo or be packaged with it later.

The intended golden path is:

```
User / Dashboard
  -> Central Orchestrator
  -> Layer Coordinator
  -> Specialist agent(s)
  -> QA, when validation is required
  -> Truth Agent
  -> Layer Coordinator
  -> Central Orchestrator
  -> ticket closure / dashboard update / daily brief inclusion
```

Truth Agent does not close work by itself. Truth Agent validates whether the claims and evidence are honest, then returns a truth-cleared packet back up the chain. Central Orchestrator, or an automation acting under Orchestrator authority, performs the ticket/status update.

---

## How It Works

```
You (or your app)
  |
  v
Central Orchestrator -----> classifies the work, routes it
  |
  |---> Research Coordinator ---> Research Analyst, Market Intel, Idea Generator, Knowledge Librarian
  |---> Build Coordinator -----> Architect, Code Developer, UX Designer, QA Testing, Truth Agent
  |---> Operate Coordinator ---> DevOps, Data Pipeline, Security, Performance
  |---> Distribution Coord. --> Marketing Strategy, Content Creation, Sales, Community
  |---> Learning Coordinator --> Analytics, Customer Insight, Experimentation, Strategy Advisor
  |---> Distribution Packager -> Manifest-verified deployable bundles
```

**The rule is simple:** Work goes in through the Orchestrator, gets routed to the right layer, specialists do the work, results come back up. No shortcuts, no cross-layer chaos.

---

## Quick Start

### Use one agent

1. Open any agent file (e.g., `agents/specialists/build/architect.md`)
2. Copy the entire contents
3. Paste it as the system prompt in your LLM chat or API call
4. That agent now knows its role, boundaries, and output format

### Use the full team

1. Set up the Central Orchestrator as your entry point
2. When it produces a handoff packet, route it to the named Coordinator
3. The Coordinator routes to specialists and returns results
4. Results flow back up to the Orchestrator

Any multi-agent framework works: Claude Code agents, AutoGen, CrewAI, LangGraph, or your own orchestration code.

---

## The Five Layers

| Layer | What It Does | Specialists |
|---|---|---|
| **Research** | Finds signal — trends, competitors, gaps, ideas | Research Analyst, Market Intelligence, Idea Generator, Knowledge Librarian |
| **Build** | Makes things — architecture, code, design, testing | Architect, Code Developer, UX Designer, QA Testing |
| **Operate** | Keeps things running — deploys, monitors, secures | DevOps, Data Pipeline, Security, Performance Optimization |
| **Distribution** | Gets things to people — positioning, content, sales | Marketing Strategy, Content Creation, Sales Enablement, Community Manager |
| **Learning** | Makes things better — analytics, feedback, experiments | Analytics, Customer Insight, Experimentation, Strategy Advisor |

Cross-cutting roles:

| Role | What It Does |
|---|---|
| **Truth Agent** | Validates that QA-passed work and closure/status claims are supported by real evidence |
| **Distribution Packager** | Builds deployable bundles from manifests without inferring missing files |

---

## What Makes This Production-Ready

Three contracts in the `contracts/` folder prevent the problems that kill most multi-agent systems:

### 1. Failure Packets (`contracts/failure-packet-contract.md`)

**Problem:** An agent fails silently. The system waits forever or produces nothing.

**Solution:** Every agent must report failure explicitly. No empty outputs. Seven named failure types. Coordinators must resolve or escalate — never absorb silently.

### 2. Trace Events (`contracts/trace-emitter-contract.md`)

**Problem:** Something went wrong but you can't figure out where.

**Solution:** Every handoff emits a trace event. You get an ordered log of every routing decision, every execution, and every failure. Find the first failure point instantly.

### 3. Loop Termination (`contracts/loop-termination-contract.md`)

**Problem:** Agent A routes to Agent B, B fails and routes back to A, A routes to B again... forever.

**Solution:** Every work item carries an iteration counter. Hard limit of 15 steps. One retry per specialist. Two reroutes per coordinator. Loops detected by consecutive identical handoffs.

---

## Project Structure

```
AI_Dream_Team/
  README.md                              <-- you are here
  agents/
    orchestrator/
      central-orchestrator.md            <-- the single entry point
    coordinators/
      research-coordinator.md
      build-coordinator.md
      operate-coordinator.md
      distribution-coordinator.md
      learning-coordinator.md
    specialists/
      research/                          <-- 4 agents
      build/                             <-- 4 agents
      operate/                           <-- 4 agents
      distribution/                      <-- 4 agents
      learning/                          <-- 4 agents
  contracts/
    failure-packet-contract.md
    trace-emitter-contract.md
    loop-termination-contract.md
  docs/
    deployment_guide.md                  <-- detailed deployment options
```

---

## Rules That Hold Everywhere

1. **All work enters through Central Orchestrator** — no backdoors
2. **No direct cross-layer writes** — Research doesn't write to Build's queue
3. **Learning outputs are gated** — insights go through Orchestrator before reaching other layers
4. **Coordinators route, they don't work** — they're managers, not doers
5. **Escalation goes up, never sideways** — layers don't resolve each other's problems
6. **No silent failures** — every failure produces a named failure packet
7. **Every handoff is traced** — routing decisions are recorded before they happen
8. **Loops are killed** — hard iteration limit, no infinite retries

---

## FAQ

**Can I use just one layer?**
Yes. Start with the Orchestrator + one layer (6 agents). Add layers as you need them.

**Can I use just one specialist without the framework?**
Yes. Every agent file is standalone. Copy it and use it directly.

**What LLM do I need?**
Any. These are system prompts, not code. They work with GPT-4, Claude, Gemini, Llama, Mistral, or anything that accepts a system prompt.

**Do I need to build the routing myself?**
The prompts define what each agent does and how handoffs work. You need something that passes messages between agents — a multi-agent framework, a simple script, or manual copy-paste. The prompts handle the logic.

**Can I modify the agents?**
Yes. Each file is independent. Change what you need. The contracts in `contracts/` are the parts you should be careful changing — they're the safety layer.

---

## Repository Layout

This repository contains two parallel concerns:

- `agents/` — the prompt library. Each `.md` file is a standalone system prompt for one agent in the hierarchy. Use directly with any LLM, or copy into `.claude/agents/` as a Claude Code subagent.
- `contracts/` — the three canonical contracts (failure-packet, trace-emitter, loop-termination). All agents reference these.
- `app/` — the Dream Team v1 product (multi-tenant SaaS dashboard). Next.js 15 App Router + Supabase. Phase 0 scaffold is in progress; see `docs/design/dream_team_phase_0_implementation_plan.md`.
- `docs/` — design briefs, deployment guide, and the in-progress v1 plan set under `docs/design/`.

The prompt library (`agents/`, `contracts/`) is the actor + safety layer. The product (`app/`) is the runtime + UI that hosts those actors for end users. The two share one git history but have separate tooling — pnpm/Node lives only inside `app/`.
