# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

A library of 28 standalone LLM system prompts organized as a hierarchical AI organization. There is no code to build, test, or run — every file is a `.md` system prompt designed to be copy-pasted into any LLM or deployed as a Claude Code subagent.

## Work Queue and Ticket Management

**Primary work queue: Supabase** — tickets are stored in a Supabase database. Access via the ticketing client (`tools.ticketing.default_client()`). All work items are tracked in the `tickets` table. Query open tickets with `query_tickets(status="open", ...)`.

**Deprecated:** The Markdown-based `work_queue.md` file is no longer authoritative. It remains as a historical reference only — do not use it for routing, status, or ownership decisions.

**Why Supabase:** A Markdown file became difficult to query at 300+ tickets. Notion was evaluated but had API performance issues. Supabase provides a performant, queryable ticket store with update capability (`update_ticket(wq_id, ...)`).

## Using the Agents as Claude Code Subagents

Agent files live under `agents/` organized by layer. Each has YAML frontmatter (`name`, `description`) so Claude Code can auto-route to them. Copy them into `.claude/agents/` in any project to make them invocable with `@agent-name`:

```bash
mkdir -p .claude/agents

# Full team (28 agents, flattened into .claude/agents/)
find agents -name '*.md' -exec cp {} .claude/agents/ \;

# Or by layer
cp agents/orchestrator/*.md .claude/agents/
cp agents/coordinators/*.md .claude/agents/
cp agents/specialists/build/*.md .claude/agents/
cp agents/packager/*.md .claude/agents/

# Or a single agent
cp agents/specialists/build/architect.md .claude/agents/
```

Layout:

```
agents/
  orchestrator/    central-orchestrator.md
  coordinators/    {build,research,operate,distribution,learning}-coordinator.md
  specialists/
    build/         architect, ux-designer, code-developer, qa-testing, truth_agent
    research/      research-analyst, market-intelligence, idea-generator, knowledge-librarian
    operate/       devops, data-pipeline, security, performance-optimization
    distribution/  marketing-strategy, content-creation, sales-enablement, community-manager
    learning/      analytics, customer-insight, experimentation, strategy-advisor
  packager/        distribution-packager.md
contracts/         failure-packet, loop-termination, trace-emitter
docs/              getting-started-*, deployment_guide
```

Then invoke by name in Claude Code:
```
@central-orchestrator I need to build a customer feedback dashboard
@architect Design a CLI tool for JSON schema validation
```

## Architecture

Work flows in one direction: **Orchestrator → Coordinator → Specialists → QA → Truth Agent → back up**.

```
Central Orchestrator          (classifies, routes, gates feedback)
├── Research Coordinator  →   Analyst, Market Intelligence, Idea Generator, Knowledge Librarian
├── Build Coordinator     →   Architect → [UX Designer ∥] → Code Developer → QA Testing → Truth Agent
├── Operate Coordinator   →   DevOps, Data Pipeline, Security, Performance Optimization
├── Distribution Coord.   →   Marketing Strategy, Content Creation, Sales Enablement, Community Manager
├── Learning Coordinator  →   Analytics, Customer Insight, Experimentation, Strategy Advisor
└── Distribution Packager →   [bundle assembly from manifests — see below]
```

**Distribution Packager** is invoked when a packaging request is received — e.g., "package the team as a Claude Code bundle." It is not a routing coordinator; it runs once, produces a zip, and stops.

**Hard rules baked into every agent:**
- All work enters through Central Orchestrator — no direct cross-layer access
- Coordinators route; they do not do specialist work
- Learning outputs are gated by the Orchestrator before reaching any upstream layer
- QA failures return to Code Developer within the Build layer — they never escape to the Orchestrator until resolved
- Truth Agent validates all QA-passed Build layer work before it reaches the Central Orchestrator
- Distribution Packager produces bundles from manifest files — it does not infer or create partial packages

## Three Contracts (Do Not Modify Without Care)

The files in `contracts/` are the safety layer. They are marked `Canonical — do not modify without governance amendment`.

| Contract | What It Prevents |
|---|---|
| `failure-packet-contract.md` | Silent failures. Every agent must emit a structured failure packet — empty output is a violation. Seven named failure types: `input_missing`, `input_invalid`, `dependency_unavailable`, `execution_error`, `quality_gate_fail`, `scope_exceeded`, `timeout`. |
| `trace-emitter-contract.md` | Untraceable failures. Every handoff emits a trace event before it happens, with monotonic sequence numbers. Traces are append-only. |
| `loop-termination-contract.md` | Infinite routing loops. Hard limit: `MAX_ORCHESTRATION_ITERATIONS = 15`. Specialists get 1 retry; coordinators get 2 reroutes; orchestrator gets 2 cross-layer reroutes. Consecutive identical `from`/`to` with no state change = loop detected → stop. |

## Agent File Format

Every agent file follows this structure:

```markdown
# AGENT NAME
## Identity       — who this agent is and what it does not do
## Core Function  — primary responsibilities
## Input Requirements / Routing Logic — what it expects
## Output Format  — the exact packet structure it produces
## Boundaries     — explicit non-responsibilities
## Stop Condition — when the agent's job ends
```

Handoff packets, failure packets, and trace events all use fixed labeled-field formats (e.g., `HANDOFF PACKET`, `FAILURE PACKET`, `TRACE EVENT`) — preserve this formatting when editing.

## Editing Guidelines

- **Specialists** are independent — edits to one don't affect others.
- **Coordinators** depend on knowing their specialists' names and output formats — if you rename a specialist, update its coordinator.
- **Contracts** are cross-cutting — all 26 agents reference them. A format change to a contract requires updating every agent that implements it.
- The `docs/` files (`getting-started-*.md`, `deployment_guide.md`) are documentation only — they don't affect agent behavior.
