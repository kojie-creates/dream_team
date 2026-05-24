#!/bin/bash
# Agent: analytics
# This script loads the agent prompt and calls the configured LLM API

set -e

AGENT_PROMPT="$(cat "$(dirname "$0")/analytics.md" 2>/dev/null || cat "$(dirname "$0")/analytics.sh" 2>/dev/null)"
USER_TASK="$*"

# Call the LLM with the agent prompt
call_llm() {
    local system="$1"
    local user="$2"

    if [ -n "${OPENAI_API_KEY:-}" ]; then
        curl -s https://api.openai.com/v1/chat/completions \
            -H "Authorization: Bearer ${OPENAI_API_KEY}" \
            -H "Content-Type: application/json" \
            -d "" | jq -r '.choices[0].message.content'
    elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
        curl -s https://api.anthropic.com/v1/messages \
            -H "Authorization: Bearer ${ANTHROPIC_API_KEY}" \
            -H "Content-Type: application/json" \
            -H "x-api-key: ${ANTHROPIC_API_KEY}" \
            -d "" | jq -r '.content[0].text'
    else
        echo "Error: Set OPENAI_API_KEY or ANTHROPIC_API_KEY"
        exit 1
    fi
}

if [ -z "${USER_TASK}" ]; then
    echo "Usage: $(basename "$0") <task description>"
    exit 1
fi

call_llm "${AGENT_PROMPT}" "${USER_TASK}"
