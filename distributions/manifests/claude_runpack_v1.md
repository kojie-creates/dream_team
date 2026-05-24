# Claude Code Runpack Manifest v1

## Host: Claude Code (claude.ai/code + CLI)
## Version: 1.0.0

---

## About This Manifest

This manifest defines the complete file set for packaging the AI Dream Team as a Claude Code subagent library. Each agent file maps to a Claude Code `@agent-name` invocation.

After deployment, agents are invoked in Claude Code with:
```
@central-orchestrator [task description]
@build-coordinator [task description]
@architect [task description]
```

---

## Agents

central-orchestrator.md
research-coordinator.md
build-coordinator.md
operate-coordinator.md
distribution-coordinator.md
learning-coordinator.md
research-analyst.md
market-intelligence.md
idea-generator.md
knowledge-librarian.md
architect.md
code-developer.md
qa-testing.md
ux-designer.md
devops.md
data-pipeline.md
security.md
performance-optimization.md
marketing-strategy.md
content-creation.md
sales-enablement.md
community-manager.md
analytics.md
customer-insight.md
experimentation.md
strategy-advisor.md
truth_agent.md
distribution-packager.md

---

## Contracts

failure-packet-contract.md
trace-emitter-contract.md
loop-termination-contract.md

---

## Documentation

CLAUDE.md
README.md
getting-started.md
getting-started-claude-code.md

---

## Output Layout

```
.innerlight/
├── .claude/
│   └── agents/
│       ├── central-orchestrator.md
│       ├── research-coordinator.md
│       ├── build-coordinator.md
│       ├── operate-coordinator.md
│       ├── distribution-coordinator.md
│       ├── learning-coordinator.md
│       ├── research-analyst.md
│       ├── market-intelligence.md
│       ├── idea-generator.md
│       ├── knowledge-librarian.md
│       ├── architect.md
│       ├── code-developer.md
│       ├── qa-testing.md
│       ├── ux-designer.md
│       ├── devops.md
│       ├── data-pipeline.md
│       ├── security.md
│       ├── performance-optimization.md
│       ├── marketing-strategy.md
│       ├── content-creation.md
│       ├── sales-enablement.md
│       ├── community-manager.md
│       ├── analytics.md
│       ├── customer-insight.md
│       ├── experimentation.md
│       ├── strategy-advisor.md
│       ├── truth_agent.md
│       └── distribution-packager.md
├── contracts/
│   ├── failure-packet-contract.md
│   ├── trace-emitter-contract.md
│   └── loop-termination-contract.md
├── CLAUDE.md
├── README.md
├── getting-started.md
└── getting-started-claude-code.md
```

---

## Agent Naming Convention

Agent filename matches invocation name:
- `central-orchestrator.md` → `@central-orchestrator`
- `research-coordinator.md` → `@research-coordinator`
- `build-coordinator.md` → `@build-coordinator`
- `operate-coordinator.md` → `@operate-coordinator`
- `distribution-coordinator.md` → `@distribution-coordinator`
- `learning-coordinator.md` → `@learning-coordinator`
- `architect.md` → `@architect`
- `code-developer.md` → `@code-developer`
- `qa-testing.md` → `@qa-testing`
- `ux-designer.md` → `@ux-designer`
- `devops.md` → `@devops`
- `data-pipeline.md` → `@data-pipeline`
- `security.md` → `@security`
- `performance-optimization.md` → `@performance-optimization`
- `marketing-strategy.md` → `@marketing-strategy`
- `content-creation.md` → `@content-creation`
- `sales-enablement.md` → `@sales-enablement`
- `community-manager.md` → `@community-manager`
- `analytics.md` → `@analytics`
- `customer-insight.md` → `@customer-insight`
- `experimentation.md` → `@experimentation`
- `strategy-advisor.md` → `@strategy-advisor`
- `truth_agent.md` → `@truth-agent`
- `distribution-packager.md` → `@distribution-packager`
- `research-analyst.md` → `@research-analyst`
- `market-intelligence.md` → `@market-intelligence`
- `idea-generator.md` → `@idea-generator`
- `knowledge-librarian.md` → `@knowledge-librarian`

---

## Supabase Work Queue

The work queue requires a Supabase project. Set environment variables before use:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

The ticketing client is accessed via `tools.ticketing.default_client()`.
