# Getting Started with Claude Code

Use the AI Dream Team as Claude Code subagents that you can invoke from your terminal or IDE.

---

## What You Need

- Claude Code installed ([claude.ai/code](https://claude.ai/code))
- A project directory where you want to use the agents

---

## Setup

### Step 1 — Create the agents directory

In your project root, create `.claude/agents/`:

```bash
mkdir -p .claude/agents
```

### Step 2 — Copy agent files

Copy any agents you want to use into `.claude/agents/`. Each file becomes a subagent you can invoke.

```bash
# Copy the full team
cp -r /path/to/AI_Dream_Team/agents/orchestrator/*.md .claude/agents/
cp -r /path/to/AI_Dream_Team/agents/coordinators/*.md .claude/agents/
cp -r /path/to/AI_Dream_Team/agents/specialists/**/*.md .claude/agents/

# Or just the ones you need
cp /path/to/AI_Dream_Team/agents/specialists/build/architect.md .claude/agents/
cp /path/to/AI_Dream_Team/agents/specialists/build/code-developer.md .claude/agents/
```

### Step 3 — Verify agents are visible

Open Claude Code and type `/agents` or check that your agents appear in the agent list.

---

## How to Use

### Invoke a single agent

In Claude Code, reference an agent by name:

```
@architect Design the system architecture for a REST API that handles user authentication
```

The agent responds within its defined role — it will produce an Architecture Decision Record, not code.

### Run the full pipeline

Start with the orchestrator:

```
@central-orchestrator I need to build a customer feedback dashboard with real-time updates
```

The orchestrator classifies the work and produces a handoff packet telling you which coordinator to call next. Follow the routing:

```
@build-coordinator [paste the handoff packet from the orchestrator]
```

The coordinator routes to specialists:

```
@architect [paste the handoff from the build coordinator]
```

Then:

```
@code-developer [paste the ADR from the architect]
```

Then:

```
@qa-testing [paste the implementation artifact from the code developer]
```

### Use agents in parallel

Claude Code supports parallel agent calls. When the Build Coordinator says "Architect and UX Designer run in parallel":

```
@architect [architecture task from handoff]
@ux-designer [design task from handoff]
```

---

## File Format

Each agent file uses Claude Code's subagent format:

```markdown
# AGENT NAME

## Identity
[who this agent is]

## Core Function
[what it does]

## Boundaries
[what it does NOT do]

## Stop Condition
[when it's done]
```

No YAML frontmatter is required — Claude Code reads the markdown directly.

---

## Tips

- **Start small.** Try one specialist (like the Architect) before deploying the full team.
- **Follow the handoff packets.** Each agent produces structured output that the next agent consumes. Copy-paste the output into the next agent's input.
- **Don't skip the Orchestrator** for multi-step work. It classifies the signal correctly. Going directly to a specialist with ambiguous input produces worse results.
- **QA is not optional.** The Build layer sequence is Architect → Code Developer → QA. Skipping QA means shipping untested work.

---

## Example: Full Pipeline

```
You: @central-orchestrator Build a CLI tool that validates JSON schema files

Orchestrator returns:
  HANDOFF PACKET → Build Coordinator
  Signal: Build
  Expected output: Working CLI tool with tests

You: @build-coordinator [handoff packet]

Build Coordinator returns:
  Route to Architect first, then Code Developer, then QA

You: @architect Design a CLI tool for JSON schema validation

Architect returns:
  ADR with stack choice, boundaries, constraints

You: @code-developer [ADR from architect]

Code Developer returns:
  Implementation artifact with files and test instructions

You: @qa-testing [implementation artifact + ADR]

QA returns:
  PASS or FAIL with evidence
```

Each step takes 30 seconds. The full pipeline produces a spec'd, built, and tested artifact.
