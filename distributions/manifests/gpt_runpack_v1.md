# ChatGPT Runpack Manifest v1

## Host: ChatGPT (chat.openai.com + API)
## Version: 1.0.0

---

## About This Manifest

This manifest defines the complete file set for packaging the AI Dream Team as a standalone system prompt for ChatGPT. The system prompt is loaded as a single file — the Central Orchestrator runs the entire team in a single conversation session.

Use cases:
- Single-session workflow (no persistent state between sessions)
- ChatGPT Plus subscriber using the web interface
- API deployment with `system` parameter

---

## Primary System Prompt

central-orchestrator.md

This is the only file required for ChatGPT. Paste its contents into the ChatGPT system prompt field (or pass as the `system` parameter via API).

---

## Optional Support Agents

For multi-agent workflows within a single ChatGPT session, these additional agents can be loaded sequentially:

build-coordinator.md
distribution-coordinator.md
architect.md
code-developer.md
qa-testing.md
marketing-strategy.md
content-creation.md
devops.md
security.md
analytics.md
customer-insight.md
truth_agent.md

---

## Contracts

failure-packet-contract.md
trace-emitter-contract.md
loop-termination-contract.md

---

## Documentation

README.md
getting-started-chatgpt.md

---

## Output Layout

```
innerlight-chatgpt/
├── system-prompt.txt              # Central Orchestrator — paste this into ChatGPT
├── agents/
│   ├── build-coordinator.txt     # optional — load when building
│   ├── distribution-coordinator.txt
│   ├── architect.txt
│   ├── code-developer.txt
│   ├── qa-testing.txt
│   ├── marketing-strategy.txt
│   ├── content-creation.txt
│   ├── devops.txt
│   ├── security.txt
│   ├── analytics.txt
│   ├── customer-insight.txt
│   └── truth_agent.txt
├── contracts/
│   ├── failure-packet-contract.md
│   ├── trace-emitter-contract.md
│   └── loop-termination-contract.md
├── README.md
└── getting-started-chatgpt.md
```

---

## How to Use on ChatGPT

### Web Interface (ChatGPT Plus)

1. Open [chat.openai.com](https://chat.openai.com)
2. Click your name → Settings → Beta Features → enable "Instructions for Custom GPTs" (if available)
3. Create a new Custom GPT
4. Paste the contents of `system-prompt.txt` into the Instructions field
5. Save

Or for direct use:

1. Open a new chat
2. Paste the contents of `system-prompt.txt` into the message box as your first message
3. Send — ChatGPT will now behave as the Central Orchestrator

### API Usage

```python
import openai

response = openai.ChatCompletion.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": open("system-prompt.txt").read()}
        {"role": "user", "content": "I need to build a landing page for my AI startup"}
    ]
)
```

---

## Session Notes

ChatGPT sessions do not persist state between conversations. For work that spans multiple sessions:

1. At the start of each new session, paste the system prompt again
2. Reference prior outputs by copying them into the new session context
3. Use the Central Orchestrator's handoff packet format to track state between sessions

The Supabase ticket system provides external state between sessions.
