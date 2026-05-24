# Getting Started with ChatGPT

Use the AI Dream Team as Custom GPTs or as system prompts in the ChatGPT API. Each agent becomes a specialized GPT you can talk to or call programmatically.

---

## What You Need

- ChatGPT Plus, Team, or Enterprise account (for Custom GPTs)
- Or: OpenAI API access (for API integration)

---

## Option A — Custom GPTs (No Code)

### Step 1 — Create a Custom GPT

1. Go to [chat.openai.com](https://chat.openai.com)
2. Click your name → "My GPTs" → "Create a GPT"
3. Switch to the **Configure** tab

### Step 2 — Configure the GPT

- **Name:** `Dream Team — Architect` (or whatever agent you're adding)
- **Description:** Copy the one-line description from the agent's Identity section
- **Instructions:** Copy the **entire contents** of the agent's `.md` file and paste into the Instructions field

Leave everything else default. No actions, no knowledge files, no code interpreter needed — the agent's behavior comes entirely from the system prompt.

### Step 3 — Save and repeat

Create one Custom GPT per agent. Start with these 5:

| GPT Name | Source File |
|---|---|
| Dream Team — Orchestrator | `agents/orchestrator/central-orchestrator.md` |
| Dream Team — Build Coordinator | `agents/coordinators/build-coordinator.md` |
| Dream Team — Architect | `agents/specialists/build/architect.md` |
| Dream Team — Code Developer | `agents/specialists/build/code-developer.md` |
| Dream Team — QA | `agents/specialists/build/qa-testing.md` |

### Step 4 — Use

Open any Custom GPT and give it work within its role. Follow the handoff chain:

```
Orchestrator → "Route to Build Coordinator"
  → open Build Coordinator GPT, paste handoff
Build Coordinator → "Route to Architect"
  → open Architect GPT, paste assignment
Architect → produces ADR
  → open Code Developer GPT, paste ADR
Code Developer → produces implementation
  → open QA GPT, paste implementation + ADR
QA → PASS or FAIL
```

Each GPT conversation is separate. Copy-paste the structured outputs between them.

---

## Option B — ChatGPT API (Programmatic)

### Step 1 — Use agent files as system prompts

Each agent file becomes the `system` message in your API call:

```python
import openai

# Read the agent prompt
with open("agents/specialists/build/architect.md") as f:
    architect_prompt = f.read()

response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": architect_prompt},
        {"role": "user", "content": "Design a REST API for task management with user auth"}
    ]
)

print(response.choices[0].message.content)
```

### Step 2 — Chain agents programmatically

```python
def call_agent(agent_file, user_input):
    with open(agent_file) as f:
        system_prompt = f.read()
    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input}
        ]
    )
    return response.choices[0].message.content

# Pipeline: Orchestrator → Architect → Code Developer → QA
task = "Build a CLI tool that converts CSV files to JSON"

handoff = call_agent("agents/orchestrator/central-orchestrator.md", task)
print("Orchestrator:", handoff)

# Parse the handoff to get the routed layer, then call the coordinator
architecture = call_agent("agents/specialists/build/architect.md", handoff)
print("Architect:", architecture)

implementation = call_agent("agents/specialists/build/code-developer.md", architecture)
print("Code Developer:", implementation)

qa_result = call_agent("agents/specialists/build/qa-testing.md", implementation)
print("QA:", qa_result)
```

### Step 3 — Add failure handling

Use the failure packet contract to detect when an agent can't complete work:

```python
def call_agent_with_failure_handling(agent_file, user_input):
    result = call_agent(agent_file, user_input)

    # Check if the agent returned a failure packet
    if "FAILURE PACKET" in result:
        print(f"Agent failed: {result}")
        return None, result  # Return failure for upstream handling

    return result, None

output, failure = call_agent_with_failure_handling(
    "agents/specialists/build/code-developer.md",
    architecture
)

if failure:
    # Route failure back to coordinator for resolution
    resolution = call_agent("agents/coordinators/build-coordinator.md", failure)
```

---

## Option C — GPT Assistants API

For persistent, stateful agents:

```python
import openai

client = openai.OpenAI()

# Create an assistant for each agent
with open("agents/specialists/build/architect.md") as f:
    architect_prompt = f.read()

architect = client.beta.assistants.create(
    name="Dream Team — Architect",
    instructions=architect_prompt,
    model="gpt-4o"
)

# Create a thread and run
thread = client.beta.threads.create()
client.beta.threads.messages.create(
    thread_id=thread.id,
    role="user",
    content="Design a microservices architecture for an e-commerce platform"
)

run = client.beta.threads.runs.create_and_poll(
    thread_id=thread.id,
    assistant_id=architect.id
)

messages = client.beta.threads.messages.list(thread_id=thread.id)
print(messages.data[0].content[0].text.value)
```

This gives you persistent threads per agent — useful when a specialist needs multiple turns to complete work.

---

## Tips

- **Custom GPTs are the easiest start.** No code, no API key. Just paste the prompt and go.
- **Use GPT-4o or better.** The agents rely on following structured output formats. Smaller models may not follow the packet formats reliably.
- **One GPT per agent, one conversation per task.** Don't reuse a conversation for multiple unrelated tasks — the context bleeds.
- **Save your handoff packets.** The structured outputs (HANDOFF PACKET, ADR, etc.) are the interface between agents. Treat them like API responses — copy them exactly.
- **The Orchestrator is worth using.** It's tempting to go directly to a specialist. The Orchestrator adds one step but classifies the work correctly, which means the specialist gets better input.
