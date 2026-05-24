# CLI Runpack Manifest v1

## Host: CLI Tool (command-line interface)
## Version: 1.0.0

---

## About This Manifest

This manifest defines the file set for packaging the AI Dream Team as a standalone CLI tool. Each agent is exposed as a subcommand, with handoff packets passed as JSON between commands.

Use cases:
- Local developer tooling (CI/CD scripts, deployment automation)
- Integration with shell scripts and cron jobs
- Backend for custom dashboards or internal tools

---

## Agent Command Scripts

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
deployment_guide.md

---

## Output Layout

```
innerlight-cli/
├── bin/
│   └── innerlight               # CLI entry point
├── agents/
│   ├── central-orchestrator.sh
│   ├── research-coordinator.sh
│   ├── build-coordinator.sh
│   ├── operate-coordinator.sh
│   ├── distribution-coordinator.sh
│   ├── learning-coordinator.sh
│   ├── research-analyst.sh
│   ├── market-intelligence.sh
│   ├── idea-generator.sh
│   ├── knowledge-librarian.sh
│   ├── architect.sh
│   ├── code-developer.sh
│   ├── qa-testing.sh
│   ├── ux-designer.sh
│   ├── devops.sh
│   ├── data-pipeline.sh
│   ├── security.sh
│   ├── performance-optimization.sh
│   ├── marketing-strategy.sh
│   ├── content-creation.sh
│   ├── sales-enablement.sh
│   ├── community-manager.sh
│   ├── analytics.sh
│   ├── customer-insight.sh
│   ├── experimentation.sh
│   ├── strategy-advisor.sh
│   ├── truth_agent.sh
│   └── distribution-packager.sh
├── contracts/
│   ├── failure-packet-contract.md
│   ├── trace-emitter-contract.md
│   └── loop-termination-contract.md
└── README.md
```

---

## CLI Command Reference

```
innerlight --help

Commands:
  innerlight orchestrate <task>         Route a task through Central Orchestrator
  innerlight build <task>               Route to Build layer
  innerlight research <task>            Route to Research layer
  innerlight operate <task>            Route to Operate layer
  innerlight distribute <task>         Route to Distribution layer
  innerlight learn <task>               Route to Learning layer
  innerlight package <host>             Build a distribution bundle
  innerlight trace <work-item-id>       Reconstruct trace from work item
  innerlight queue                      List open tickets in Supabase
```

---

## CLI Usage Examples

### Basic task routing

```bash
# Route a research task
innerlight research "Analyze the AI code review market for small dev teams"

# Route a build task
innerlight build "Build a landing page for my AI startup"

# Route to Distribution layer
innerlight distribute "Write my launch week content plan"
```

### Package the team

```bash
# Package for Claude Code
innerlight package claude

# Package for ChatGPT
innerlight package chatgpt

# Package for API use
innerlight package api
```

### Check the work queue

```bash
# List open tickets
innerlight queue --status open

# List Build layer tickets
innerlight queue --layer build --status in_progress
```

### Reconstruct a trace

```bash
# Show the full trace for a work item
innerlight trace WI-001
```

---

## Environment Variables

```
OPENAI_API_KEY          # Required for OpenAI API calls
ANTHROPIC_API_KEY      # Required for Anthropic API calls
SUPABASE_URL           # Supabase project URL (for work queue)
SUPABASE_KEY            # Supabase anon key (for work queue)
INNERLIGHT_MODEL        # Override default model (default: gpt-4)
```

---

## CLI Wrapper Script (Reference Implementation)

```bash
#!/bin/bash
# innerlight-cli/bin/innerlight

set -e

COMMAND="$1"
shift

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_DIR="$SCRIPT_DIR/../agents"

case "$COMMAND" in
    orchestrate)   agent="central-orchestrator.sh" ;;
    build)          agent="build-coordinator.sh" ;;
    research)       agent="research-coordinator.sh" ;;
    operate)        agent="operate-coordinator.sh" ;;
    distribute)     agent="distribution-coordinator.sh" ;;
    learn)          agent="learning-coordinator.sh" ;;
    package)
        echo "Run: ../make-package.sh ${1:-claude}"
        exit 0
        ;;
    queue)
        curl -s "${SUPABASE_URL}/rest/v1/tickets?status=eq.open" \
            -H "apikey: ${SUPABASE_KEY:-}" \
            -H "Authorization: Bearer ${SUPABASE_KEY:-}" | jq .
        exit 0
        ;;
    *)
        echo "Usage: innerlight <command> [args]"
        echo "Commands: orchestrate, build, research, operate, distribute, learn, package, queue"
        exit 1
        ;;
esac

# Load agent prompt and call LLM
PROMPT="$(cat "$AGENTS_DIR/$agent" 2>/dev/null)"
[ -z "$PROMPT" ] && { echo "Error: Agent not found: $agent"; exit 1; }

if [ -n "${OPENAI_API_KEY:-}" ]; then
    curl -s https://api.openai.com/v1/chat/completions \
        -H "Authorization: Bearer $OPENAI_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg system "$PROMPT" --arg user "$*" '{
            model: "gpt-4",
            messages: [
                {"role": "system", "content": $system},
                {"role": "user", "content": $user}
            ]
        }')" | jq -r '.choices[0].message.content'
elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    curl -s https://api.anthropic.com/v1/messages \
        -H "Authorization: Bearer ${ANTHROPIC_API_KEY}" \
        -H "Content-Type: application/json" \
        -H "x-api-key: ${ANTHROPIC_API_KEY}" \
        -d "$(jq -n --arg system "$PROMPT" --arg user "$*" '{
            model: "claude-opus-4-7",
            max_tokens: 4096,
            messages: [{"role": "user", "content": $user}],
            system: $system
        }')" | jq -r '.content[0].text'
else
    echo "Error: Set OPENAI_API_KEY or ANTHROPIC_API_KEY"
    exit 1
fi
```
