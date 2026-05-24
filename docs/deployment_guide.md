# Deployment Guide

## Quick Reference — Agent Count

| Layer | Coordinator | Specialists | Total |
|---|---|---|---|
| --- | Central Orchestrator | --- | 1 |
| Research | Research Coordinator | Research Analyst, Market Intelligence, Idea Generator, Knowledge Librarian | 5 |
| Build | Build Coordinator | Architect, Code Developer, UX Designer, QA / Testing | 5 |
| Operate | Operate Coordinator | DevOps, Data Pipeline, Security, Performance Optimization | 5 |
| Distribution | Distribution Coordinator | Marketing Strategy, Content Creation, Sales Enablement, Community Manager | 5 |
| Learning | Learning Coordinator | Analytics, Customer Insight, Experimentation, Strategy Advisor | 5 |
| **Total** | | | **26** |

---

## Deployment Options

### Option A — Single multi-agent system

Load all 26 prompts into a multi-agent framework. Central Orchestrator is the entry point. All work enters there.

### Option B — Phased activation

Activate layers one at a time:
1. Start with Central Orchestrator + Research layer (6 agents)
2. Add Build when first research outputs exist (11 agents)
3. Add Operate when first build artifacts are deployed (16 agents)
4. Add Distribution when product is ready for market (21 agents)
5. Add Learning when usage data exists (26 agents)

### Option C — InnerLight integration

Agent definitions are schema-compatible with the InnerLight runtime. Each agent has `archetype`, `handoff_rules`, and `stop_condition` — no rewrite required for integration with the InnerLight execution boundary, admissibility gates, and causal trace infrastructure.

---

## File Structure

Each agent prompt is a standalone `.md` file in the `agents/` directory:

```
agents/
  orchestrator/central-orchestrator.md
  coordinators/
    research-coordinator.md
    build-coordinator.md
    operate-coordinator.md
    distribution-coordinator.md
    learning-coordinator.md
  specialists/
    research/   (4 agents)
    build/      (4 agents)
    operate/    (4 agents)
    distribution/ (4 agents)
    learning/   (4 agents)
```

Production contracts in `contracts/`:
```
contracts/
  failure-packet-contract.md
  trace-emitter-contract.md
  loop-termination-contract.md
```

---

## How to Deploy a Single Agent

1. Open the agent's `.md` file
2. Copy the entire contents
3. Paste as the system prompt in your LLM agent configuration
4. No modification needed — each prompt is self-contained

---

## How to Wire the Full System

1. Deploy Central Orchestrator as the entry point
2. Deploy all 5 Coordinators
3. Deploy specialists per layer as needed
4. Configure routing: Orchestrator calls Coordinators, Coordinators call Specialists
5. Implement the three contracts from `contracts/`:
   - Failure packets on every agent's error path
   - Trace events at every handoff boundary
   - Iteration counter on every work item

---

## Governance Invariants

These hold across the entire system. Violating any invariant is a structural defect.

1. All work enters through Central Orchestrator
2. No direct cross-layer writes
3. Learning outputs gated through Central Orchestrator
4. Coordinators route only — never do specialist work
5. Orchestrator routes only — never produces specialist output
6. Escalation goes up, never sideways
7. No agent may silently return empty output — failure packets mandatory
8. Every handoff boundary emits a trace event
9. Every work item carries an iteration counter — hard limit enforced
10. No retry without state change — loop detection halts identical handoffs
