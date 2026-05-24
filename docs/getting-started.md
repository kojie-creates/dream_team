# Getting Started with the AI Dream Team

The AI Dream Team is 28 AI agents that work together as a complete organization. This guide gets you from zero to running a multi-agent workflow in 10 minutes.

---

## What You're Setting Up

A team of 28 agents organized in five layers:

```
Central Orchestrator     (routes all work — your single entry point)
├── Research     → 4 specialists  (market intelligence, research, ideas, knowledge)
├── Build        → 4 specialists  (architecture, code, QA, design)
├── Operate      → 4 specialists  (DevOps, data pipeline, security, performance)
├── Distribution → 4 specialists  (marketing, content, sales, community)
└── Learning     → 4 specialists  (analytics, insight, experimentation, strategy)
```

Plus two cross-cutting roles: **Truth Agent** (validates honesty of completed work) and **Distribution Packager** (builds deployable bundles).

Each layer is managed by a coordinator. All work flows through the Central Orchestrator — no direct access to specialists.

---

## Step 1: Download and Extract

Download `innerlight-v2-[host].zip` for your platform:

| Platform | Bundle | Installation |
|----------|--------|-------------|
| Claude Code | `innerlight-v2-claude.zip` | Copy agents to `~/.claude/agents/` |
| ChatGPT | `innerlight-v2-chatgpt.zip` | Paste `system-prompt.txt` into system prompt |
| API | `innerlight-v2-api.zip` | Load agent files as `system` prompts per request |
| CLI | `innerlight-v2-cli.zip` | Install CLI tool, set API key |

Extract the zip:

```bash
mkdir dream-team && cd dream-team
unzip innerlight-v2-claude.zip
```

---

## Step 2: Set Up the Work Queue (Required)

The team tracks all work items in **Supabase** — not a file. Set up your Supabase project:

1. Create a project at [supabase.com](https://supabase.com)
2. In your Supabase SQL editor, run the schema from `tools/ticketing/schema.sql` (see below)
3. Copy your project URL and **service role key** (not the anon key — the client needs full write access)
4. Create a `.env` file in this directory:

```bash
# dream_team/.env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SECRET_KEY=your-service-role-key
```

**Why Supabase?** The Markdown-based work queue became too slow at 300+ tickets. Notion had API performance issues. Supabase gives you a fast, queryable ticket store with full CRUD operations.

### Database Schema

Run this in your Supabase SQL editor to create the required tables:

```sql
-- Supabase schema for AI Dream Team ticketing.
-- Run once against a fresh Supabase project (SQL editor or `psql`).

create table if not exists tickets (
  wq_id           text primary key,
  title           text not null,
  description     text,
  priority        text,
  stage           text not null,
  status          text not null default 'open',
  current_owner   text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  closed_at       timestamptz,
  metadata        jsonb default '{}'::jsonb,
  category        text,
  approval_record jsonb
);
create index if not exists tickets_stage_status_idx on tickets (stage, status);
create index if not exists tickets_owner_idx on tickets (current_owner);
create index if not exists tickets_metadata_idx on tickets using gin (metadata jsonb_path_ops);

create table if not exists handoffs (
  id              bigserial primary key,
  wq_id           text references tickets(wq_id) on delete cascade,
  from_stage      text,
  to_stage        text not null,
  from_owner      text,
  to_owner        text,
  packet          jsonb not null,
  created_at      timestamptz default now(),
  created_by      text
);
create index if not exists handoffs_wq_idx on handoffs (wq_id, created_at desc);

create table if not exists ticket_notes (
  id              bigserial primary key,
  wq_id           text references tickets(wq_id) on delete cascade,
  author          text,
  kind            text,
  body            text,
  attachments     jsonb,
  created_at      timestamptz default now()
);
create index if not exists notes_wq_idx on ticket_notes (wq_id, created_at desc);

create table if not exists ticket_links (
  from_id  text references tickets(wq_id) on delete cascade,
  to_id    text references tickets(wq_id) on delete cascade,
  kind     text not null,
  primary key (from_id, to_id, kind)
);

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists tickets_updated_at on tickets;
create trigger tickets_updated_at before update on tickets
  for each row execute function set_updated_at();
```

### Ticketing Client

The Python client (`tools.ticketing.default_client()`) is shared with the InnerLight engine at `Orin/tools/ticketing/client.py`. If you are running the Dream Team alongside InnerLight, the client is already available. For a standalone Dream Team setup, copy `tools/ticketing/` from the InnerLight project into your `dream_team/tools/` directory, or point your Python environment at the InnerLight `tools/` package.

---

## Step 3: Install the Agents (Claude Code)

Copy agents to your Claude Code agents directory:

```bash
cp -r .claude/agents/* ~/.claude/agents/
```

Verify with:

```bash
ls ~/.claude/agents/ | head -10
```

You should see `central-orchestrator.md`, `build-coordinator.md`, `research-coordinator.md`, etc.

---

## Step 4: Test the Setup

Open Claude Code and try the Central Orchestrator:

```
@central-orchestrator I'm building an AI-powered code review tool for small dev teams. What's the first thing I should work on?
```

You should receive a **HANDOFF PACKET** — a structured routing decision from the Central Orchestrator indicating which layer and coordinator should handle your task.

---

## Step 5: Run Your First Multi-Agent Workflow

Here's a complete example: validating a product launch strategy in one session.

**You say:**

```
@central-orchestrator I'm launching in 8 weeks. I need to validate my positioning on AI code review for small dev teams, write a launch content plan, and fix a broken deploy pipeline. Can you handle all of this?
```

**Central Orchestrator classifies and creates three routing packets:**

```
HANDOFF PACKET
To: Research Coordinator
Work item: Validate positioning for AI code review tool — small dev teams, 8-week launch window
Signal: Research
Context: Single user-architect launching solo. Positioning currently "AI code review for small teams."
Expected output: Competitive landscape report + pricing gap analysis + idea briefs
```

```
HANDOFF PACKET
To: Distribution Coordinator
Work item: Launch content plan for AI code review tool — LinkedIn, newsletter, dev.to
Signal: Distribution
Context: 8-week window, primary channels LinkedIn + newsletter
Expected output: Content plan + first draft posts
```

```
HANDOFF PACKET
To: Operate Coordinator
Work item: Fix broken deploy pipeline, 3 failed deploys in 48 hours
Signal: Operate
Context: Production down, staging false positives
Expected output: Root cause + fixes + monitoring improvements
```

**The three layers run in parallel.** Each coordinator sequences its specialists and produces outputs. No layer talks to another directly — all routing goes back through Central Orchestrator.

**Research layer output:**

```
COMPETITIVE LANDSCAPE REPORT
From: Market Intelligence
Domain: AI code review tools — SMB segment
Key gap: $50-200/month team pricing (not per-seat) is underserved
Threat: GitHub Copilot will expand PR review capabilities in 2025
Open recommendation: Lead with "opinionated review that enforces your team's standards"
```

**Distribution layer output:**

```
CONTENT PLAN — LAUNCH WEEK
From: Content Creation
Day 1: LinkedIn post — "We built Refactor because we were tired of PRs with 47 comments"
Day 2: dev.to article — "How to enforce code standards automatically"
Day 3: LinkedIn post — demo of ESLint connection
Day 4: Newsletter — launch announcement
Day 5: Hacker News — launch day post
Day 6: LinkedIn post — first customer result
Day 7: Retrospective + waitlist open
```

**Operate layer output:**

```
DEPLOYMENT REPORT
From: DevOps
Root cause: RATE_LIMIT_QUEUE renamed to RATE_LIMIT_THROTTLE in v0.14 — deployment manifest not updated
Fix: Updated manifest, added pre-deploy env var validation gate
Status: production deployable
```

**Before everything ships, QA + Truth Agent validate:**

```
QA VERDICT: PASS
From: QA / Testing
Feature: All three layer outputs
Next: Truth Agent
```

```
TRUTH REPORT
From: Truth Agent
Truth status: PASS
Checks: execution_honesty, delivery_honesty, status_integrity, artifact_presence, handoff_integrity, governance_alignment
Findings: no violations
Verdict: ready_for_central_orchestrator
```

**Central Orchestrator delivers the final package to you:**

```
WORK COMPLETE

TRACK 1 — RESEARCH:
Your positioning should lead with "opinionated review" — not "AI that reviews code." The $50-200/month team tier is the open gap. One launch-differentiating feature: "Team Standard Presets" (connect ESLint in 5 minutes).

TRACK 2 — DISTRIBUTION:
7-day launch content plan complete. Day 1 LinkedIn post drafted. Newsletter launch announcement ready.

TRACK 3 — OPERATE:
Root cause: renamed environment variable. Fix deployed. Pre-deploy health check added.

One open question for you: Is "Team Standard Presets" a launch feature or post-launch?
```

---

## How the Work Queue Tracks Everything

Every work item creates a Supabase ticket. You can query the queue:

```python
from tools.ticketing import default_client

client = default_client()

# List open tickets
open_tickets = client.query_tickets(status="open")

# Get a specific ticket
ticket = client.get_ticket("WI-001")

# Close when done
client.update_ticket("WI-001", status="closed", closed_at="2026-04-21T12:00:00Z")
```

Each layer updates the ticket as work progresses. Every handoff is traceable.

---

## The Three Rules That Keep Everything From Breaking

The team has three contracts that every agent follows. You don't need to manage these — they're built in.

**1. Failure packets** — Every agent must report failure explicitly. Empty output without a failure packet is a contract violation. Seven named failure types. Coordinators escalate or resolve — never absorb silently.

**2. Trace events** — Every handoff emits a trace event *before* it happens. You get an auditable log of every routing decision and every failure point.

**3. Loop termination** — Hard limit of 15 iterations per work item. Specialists get one retry. Coordinators get two reroutes. If a work item loops 15 times without resolution, it stops and reports with the full trace.

---

## Next Steps

**Start with one layer** — Don't try to run all five at once. Pick the layer closest to your current priority:

- Launching something? → Distribution layer
- Building something? → Build layer
- Researching a market? → Research layer
- Something breaking in production? → Operate layer
- Want to understand your users? → Learning layer

**Ask the Central Orchestrator to route** — Don't guess which specialist to use. Say what you need to accomplish and let the Orchestrator classify and route.

**Don't skip the Truth Agent** — QA validates correctness. Truth Agent validates honesty. In the workflow above, both gates run before anything ships to you. Don't bypass them.

---

## Quick Reference

**Invoke the team:**
```
@central-orchestrator [your task]
```

**Check the queue:**
```
@central-orchestrator show my open tickets
```

**Route to a specific layer:**
```
@research-coordinator [research task]
@build-coordinator [build task]
@operate-coordinator [ops task]
@distribution-coordinator [marketing/content task]
@learning-coordinator [analytics/insights task]
```

**Package the team:**
```
@distribution-packager package the team for Claude Code
```

**The stop condition rule** — Every agent stops when its output is produced and handed off. Agents do not wait for downstream results. The Central Orchestrator tracks overall completion; individual agents move on after their specific task.

---

## Troubleshooting

**"The agent didn't do anything"** — You invoked a specialist directly. Always start with `@central-orchestrator` and let it route. Specialists don't accept work directly unless you've been assigned a handoff packet.

**"QA failed and I don't know what to fix"** — The QA failure includes specific reproduction steps and severity. Route back to the Code Developer with the QA verdict attached.

**"A work item is looping"** — Check `iteration_count` on the ticket. If it's approaching 15, the Central Orchestrator should emit a timeout failure. If not, surface the blocker explicitly to the coordinator.

**"The work queue is empty"** — Create a ticket via Supabase or ask the Central Orchestrator to create one from your request.

**"I got a failure packet"** — Read the failure type and recovery suggestion. `input_missing` means resend with the required input. `quality_gate_fail` means the output didn't meet criteria — fix and retry. `timeout` means the iteration limit was reached — escalate to the Central Orchestrator.
