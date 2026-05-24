# API Runpack Manifest v1

## Host: Generic LLM API (OpenAI-compatible)
## Version: 1.0.0

---

## About This Manifest

This manifest defines the file set for packaging the AI Dream Team as a multi-agent API service. Each agent is a separate system prompt that can be loaded per request.

Use cases:
- Backend service routing requests to different agents
- Agent-by-agent API calls in a custom orchestration layer
- Integration with LangChain, AutoGen, CrewAI, or custom agent frameworks

---

## Agent System Prompts

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

README.md

---

## Output Layout

```
innerlight-api/
├── system_prompts/
│   ├── central-orchestrator.txt
│   ├── research-coordinator.txt
│   ├── build-coordinator.txt
│   ├── operate-coordinator.txt
│   ├── distribution-coordinator.txt
│   ├── learning-coordinator.txt
│   ├── research-analyst.txt
│   ├── market-intelligence.txt
│   ├── idea-generator.txt
│   ├── knowledge-librarian.txt
│   ├── architect.txt
│   ├── code-developer.txt
│   ├── qa-testing.txt
│   ├── ux-designer.txt
│   ├── devops.txt
│   ├── data-pipeline.txt
│   ├── security.txt
│   ├── performance-optimization.txt
│   ├── marketing-strategy.txt
│   ├── content-creation.txt
│   ├── sales-enablement.txt
│   ├── community-manager.txt
│   ├── analytics.txt
│   ├── customer-insight.txt
│   ├── experimentation.txt
│   ├── strategy-advisor.txt
│   ├── truth_agent.txt
│   └── distribution-packager.txt
├── contracts/
│   ├── failure-packet-contract.md
│   ├── trace-emitter-contract.md
│   └── loop-termination-contract.md
├── CLAUDE.md
└── README.md
```

---

## API Usage Example

```python
import openai
import json

# Load agent system prompts
def load_agent(name):
    with open(f"system_prompts/{name}.txt") as f:
        return f.read()

# Route to the correct agent based on task type
def route_task(task):
    if "research" in task.lower() or "market" in task.lower():
        agent = "research-coordinator"
    elif "build" in task.lower() or "code" in task.lower() or "implement" in task.lower():
        agent = "build-coordinator"
    elif "deploy" in task.lower() or "operate" in task.lower():
        agent = "operate-coordinator"
    elif "market" in task.lower() or "content" in task.lower():
        agent = "distribution-coordinator"
    elif "learn" in task.lower() or "analytics" in task.lower():
        agent = "learning-coordinator"
    else:
        agent = "central-orchestrator"
    return agent

def call_agent(agent_name, user_message, context=None):
    messages = [{"role": "system", "content": load_agent(agent_name)}]
    if context:
        messages.append({"role": "assistant", "content": context})
    messages.append({"role": "user", "content": user_message})

    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=messages
    )
    return response["choices"][0]["message"]["content"]

# Example usage
task = "I'm launching in 4 weeks. I need a launch content plan for my AI code review tool."
agent = route_task(task)
result = call_agent(agent, task)
print(result)
```

---

## Integration with Agent Frameworks

### LangChain

```python
from langchain.chat_models import ChatOpenAI
from langchain.agents import initialize_agent, Tool
from langchain.prompts import load_prompt

llm = ChatOpenAI(model="gpt-4")

# Load Dream Team agent
system_prompt = load_prompt("system_prompts/central-orchestrator.txt")

agent = initialize_agent(
    tools=[],  # your tools here
    llm=llm,
    agent="zero-shot-react-description",
    verbose=True
)
agent.agent.llm_chain.prompt.template = system_prompt
```

### AutoGen

```python
import autogen

# Central Orchestrator agent
orchestrator = autogen.Agent(
    name="central-orchestrator",
    system_message=load_agent("central-orchestrator.txt"),
    llm_config={"model": "gpt-4"}
)

# Build Coordinator agent
build_coordinator = autogen.Agent(
    name="build-coordinator",
    system_message=load_agent("build-coordinator.txt"),
    llm_config={"model": "gpt-4"}
)

# Initiate chat
orchestrator.initiate_chat(
    build_coordinator,
    message="I need to build a landing page for my AI startup",
    silent=True
)
```
