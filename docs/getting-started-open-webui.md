# Getting Started with Open WebUI

Use the AI Dream Team as custom model presets or characters in Open WebUI, giving you a team of specialists you can switch between in the chat interface.

---

## What You Need

- Open WebUI running (local or hosted)
- Admin access to create model presets
- Any LLM backend connected (Ollama, OpenAI, Anthropic, etc.)

---

## Setup

### Option A — Model Presets (Recommended)

Model presets let you create named agents that appear in your model dropdown.

**Step 1 — Open Admin Panel**

Go to `Settings > Models` (or `Admin Panel > Models` depending on your version).

**Step 2 — Create a new model preset**

Click "Add Model" or "Create Model Preset":

- **Name:** `Dream Team — Architect` (or whatever agent you're adding)
- **Base Model:** Select your preferred LLM (GPT-4, Claude, Llama, etc.)
- **System Prompt:** Copy the entire contents of the agent's `.md` file and paste it into the system prompt field

**Step 3 — Repeat for each agent you want**

Start with these 5 for a minimal setup:
1. `central-orchestrator.md` → "Dream Team — Orchestrator"
2. `build-coordinator.md` → "Dream Team — Build Coordinator"
3. `architect.md` → "Dream Team — Architect"
4. `code-developer.md` → "Dream Team — Code Developer"
5. `qa-testing.md` → "Dream Team — QA"

**Step 4 — Use**

Start a new chat, select "Dream Team — Orchestrator" from the model dropdown, and describe your work. Follow the handoff packets by switching models.

---

### Option B — Characters / Personas

If your Open WebUI version supports Characters or Personas:

**Step 1 — Go to Characters**

`Settings > Characters` or `Workspace > Characters`

**Step 2 — Create a character**

- **Name:** The agent name (e.g., "Architect")
- **Description:** One-line role description from the agent's Identity section
- **System Prompt:** Full contents of the agent's `.md` file

**Step 3 — Pin favorites**

Pin your most-used agents to the sidebar for quick switching.

---

## How to Use

### Single agent

1. Select the agent from the model/character dropdown
2. Give it a task within its role
3. It responds with its defined output format

Example with the Architect:
```
You: Design a system for real-time collaborative document editing

Architect responds with an Architecture Decision Record:
  - Problem statement
  - Proposed architecture
  - Technology stack with rationale
  - Rejected alternatives
  - Implementation constraints for Code Developer
```

### Full pipeline (manual routing)

Open WebUI doesn't auto-route between agents, so you follow the chain manually:

1. **Start a chat with the Orchestrator.** Describe your work. It produces a handoff packet.
2. **Start a new chat with the named Coordinator.** Paste the handoff packet.
3. **Start a new chat with the named Specialist.** Paste the coordinator's assignment.
4. **Copy the specialist's output** back to the coordinator or next specialist.

Each chat is a separate conversation. This keeps agent contexts clean.

### Multi-agent in one chat (advanced)

If you prefer one continuous thread, prefix your messages:

```
[TO: Orchestrator] Build me a landing page for a SaaS product

[Orchestrator responds with handoff to Distribution Coordinator]

[TO: Distribution Coordinator] [paste handoff packet]

[Distribution Coordinator routes to Marketing Strategy]

[TO: Marketing Strategy] [paste assignment]

[Marketing Strategy returns positioning brief]

[TO: Content Creation] [paste positioning brief] Write the landing page copy
```

This works but the context gets long. Separate chats per agent is cleaner.

---

## Recommended Agent Sets

### Minimal (5 agents)
For building software:
- Orchestrator, Build Coordinator, Architect, Code Developer, QA

### Content team (5 agents)
For marketing and content:
- Orchestrator, Distribution Coordinator, Marketing Strategy, Content Creation, Sales Enablement

### Research team (5 agents)
For market research and ideation:
- Orchestrator, Research Coordinator, Research Analyst, Market Intelligence, Idea Generator

### Full team (26 agents)
All layers operational. Create all 26 model presets.

---

## Tips

- **Name your presets clearly.** Use "Dream Team — [Agent Name]" so they sort together in the dropdown.
- **Use the same base model** for all agents so output quality is consistent.
- **Don't mix agents in one chat** unless you're comfortable with long contexts. Each agent works best in a clean conversation.
- **Save handoff packets.** Copy the structured output (HANDOFF PACKET, ADR, IMPLEMENTATION ARTIFACT, etc.) — these are the contracts between agents.
