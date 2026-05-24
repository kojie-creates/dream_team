#!/bin/bash
#===============================================================================
# AI Dream Team — Distribution Packager Makefile
#
# Usage:
#   ./make-package.sh <host> [--dry-run]
#
# Hosts:
#   claude   — Claude Code agents (28 agents → ~/.claude/agents/)
#   chatgpt  — ChatGPT single-system-prompt bundle
#   api      — API bundle (agent files as separate system prompts)
#   cli      — CLI tool bundle (28 agent scripts + wrapper)
#   local    — refresh this repo's .claude/agents/ in place
#   all      — build all bundles
#
# Examples:
#   ./make-package.sh claude           # build Claude Code bundle
#   ./make-package.sh chatgpt --dry-run # preview ChatGPT bundle without creating files
#   ./make-package.sh all               # build everything
#
# Requirements:
#   - Bash 4+ (macOS, Linux, Git Bash on Windows)
#   - zip utility (available on all platforms)
#   - All source files must exist at paths declared in manifest
#
# Output:
#   distributions/portable/innerlight-v2-<host>.zip
#   distributions/portable/<host>/   (flat output directory)
#
#===============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/distributions/portable"
MANIFEST_DIR="$SCRIPT_DIR/distributions/manifests"
SOURCE_DIR="$SCRIPT_DIR"

# Host-to-manifest mapping
declare -A MANIFEST_MAP=(
    [claude]="claude"
    [chatgpt]="gpt"
    [api]="api"
    [cli]="cli"
)

# Colors (fallback if not available)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

#-------------------------------------------------------------------------------
# Helpers
#-------------------------------------------------------------------------------

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC} $*" >&2; exit 1; }

# Resolve a bare manifest filename (e.g. "architect.md") to its actual path
# under the hierarchy: agents/**, contracts/, docs/, or repo root.
# Prints absolute path on stdout; returns 1 if not found.
resolve_src() {
    local name="$1"
    case "$name" in
        *-contract.md)
            [ -f "$SOURCE_DIR/contracts/$name" ] && { echo "$SOURCE_DIR/contracts/$name"; return 0; } ;;
        README.md|CLAUDE.md|work_queue.md)
            [ -f "$SOURCE_DIR/$name" ] && { echo "$SOURCE_DIR/$name"; return 0; } ;;
        getting-started*|deployment_guide*)
            [ -f "$SOURCE_DIR/docs/$name" ] && { echo "$SOURCE_DIR/docs/$name"; return 0; } ;;
    esac
    # Default: search agents/ tree
    local hit
    hit="$(find "$SOURCE_DIR/agents" -type f -name "$name" 2>/dev/null | head -n1)"
    [ -n "$hit" ] && { echo "$hit"; return 0; }
    # Fallback: anywhere under SOURCE_DIR except distributions/
    hit="$(find "$SOURCE_DIR" -type f -name "$name" -not -path "*/distributions/*" 2>/dev/null | head -n1)"
    [ -n "$hit" ] && { echo "$hit"; return 0; }
    return 1
}

# Iterate every agent .md file under agents/ tree
list_agent_files() {
    find "$SOURCE_DIR/agents" -type f -name '*.md' 2>/dev/null
}

# Check for zip — fall back to PowerShell on Windows
create_zip() {
    local source_dir="$1"
    local zip_file="$2"
    local parent_dir="$(dirname "$source_dir")"
    local base_dir="$(basename "$source_dir")"

    if command -v zip &>/dev/null; then
        (cd "$parent_dir" && zip -r "$(basename "$zip_file")" "$base_dir")
    elif command -v cygpath &>/dev/null; then
        # Windows with Cygwin — convert Unix paths to Windows
        local win_source
        win_source="$(cygpath -w "$source_dir")"
        local win_zip
        win_zip="$(cygpath -w "$zip_file")"
        mkdir -p "$parent_dir" 2>/dev/null || true
        powershell.exe -Command "Compress-Archive -Path '${win_source}\*' -DestinationPath '${win_zip}' -Force"
    elif command -v powershell.exe &>/dev/null; then
        # Try PowerShell with Unix path directly (Git Bash on Windows)
        mkdir -p "$source_dir" 2>/dev/null || true
        mkdir -p "$parent_dir" 2>/dev/null || true
        powershell.exe -Command "Compress-Archive -Path '${source_dir}\*' -DestinationPath '${zip_file}' -Force"
    else
        warn "zip utility not found — skipping archive creation"
        warn "On Windows: Install Git Bash with zip, or use PowerShell directly:"
        warn "  Compress-Archive -Path '${source_dir}\*' -DestinationPath '${zip_file}'"
        return 1
    fi
}

usage() {
    cat <<EOF
Usage: $0 <host> [options]

Hosts:
  claude   — Claude Code subagent bundle (28 agents + contracts + docs)
  chatgpt  — ChatGPT system-prompt bundle (single file + optional agents)
  api      — API bundle (28 agents as separate system prompt files)
  cli      — CLI tool bundle (28 agent scripts + CLI wrapper)
  local    — refresh this repo's .claude/agents/ so /agents picks them up
  all      — build all bundles (excludes local)

Options:
  --dry-run   List files that would be included without creating anything
  --verbose   Show each file as it's copied
  --help      Show this message

Examples:
  $0 claude           # build Claude Code bundle
  $0 chatgpt          # build ChatGPT bundle
  $0 all              # build all bundles
  $0 claude --dry-run # preview without creating files

Manifests:
  distributions/manifests/claude_runpack_v1.md
  distributions/manifests/gpt_runpack_v1.md
  distributions/manifests/api_runpack_v1.md
  distributions/manifests/cli_runpack_v1.md
EOF
    exit 0
}

#-------------------------------------------------------------------------------
# Package builders
#-------------------------------------------------------------------------------

# Parse a manifest file and return the list of agent/contract/doc files
# Skips comments, headers, blank lines, example code sections, and ASCII tree lines
parse_manifest() {
    local manifest="$1"
    grep '\.md$' "$manifest" \
        | grep -v '^#' \
        | sed 's/^[[:space:]]*//;s/[│├└─]//g' \
        | cut -d' ' -f1 \
        | grep -v '^Output' \
        | grep -v '^CLI' \
        | grep -v '^##' \
        | grep -v 'Integration' \
        | grep -v '^│' \
        | grep -v '^├' \
        | grep -v '^└' \
        | grep -v '^$' \
        | sort -u
}

build_claude() {
    local manifest="$MANIFEST_DIR/claude_runpack_v1.md"
    local output_dir="$DIST_DIR/claude"
    local zip_file="$DIST_DIR/innerlight-v2-claude.zip"

    info "Building Claude Code bundle..."

    # Verify manifest exists
    [ -f "$manifest" ] || error "Manifest not found: $manifest"

    # Create output directory
    mkdir -p "$output_dir/.claude/agents"
    mkdir -p "$output_dir/contracts"

    # Copy agents from ## Agents section only
    local agent_count=0
    local in_section=""
    while IFS= read -r line; do
        if [[ "$line" =~ ^##\ Agents ]]; then
            in_section="agents"; continue
        elif [[ "$line" =~ ^##\ (Contracts|Documentation|Output) ]]; then
            in_section=""; continue
        fi
        [ -z "$in_section" ] && continue

        local src
        src="$(echo "$line" | sed 's/^[[:space:]]*//;s/[│├└─]//g' | cut -d' ' -f1)"
        [ -z "$src" ] && continue
        [[ "$src" =~ ^# ]] && continue

        local resolved
        if resolved="$(resolve_src "$src")"; then
            cp "$resolved" "$output_dir/.claude/agents/"
            [ "${VERBOSE:-false}" = true ] && echo "  + $src ($resolved)"
            ((agent_count++)) || true
        else
            warn "Missing: $src"
        fi
    done < "$manifest"

    # Copy contracts from ## Contracts section only
    local contract_count=0
    in_section=""
    while IFS= read -r line; do
        if [[ "$line" =~ ^##\ Contracts ]]; then
            in_section="contracts"; continue
        elif [[ "$line" =~ ^##\ (Documentation|Output) ]]; then
            in_section=""; continue
        fi
        [ -z "$in_section" ] && continue

        local src
        src="$(echo "$line" | sed 's/^[[:space:]]*//;s/[│├└─]//g' | cut -d' ' -f1)"
        [ -z "$src" ] && continue
        [[ "$src" =~ ^# ]] && continue

        local resolved
        if resolved="$(resolve_src "$src")"; then
            cp "$resolved" "$output_dir/contracts/"
            ((contract_count++)) || true
        else
            warn "Missing: $src"
        fi
    done < "$manifest"

    # Copy docs from ## Documentation section only
    in_section=""
    while IFS= read -r line; do
        if [[ "$line" =~ ^##\ Documentation ]]; then
            in_section="docs"; continue
        elif [[ "$line" =~ ^##\ Output ]]; then
            in_section=""; continue
        fi
        [ -z "$in_section" ] && continue

        local src
        src="$(echo "$line" | sed 's/^[[:space:]]*//;s/[│├└─]//g' | cut -d' ' -f1)"
        [ -z "$src" ] && continue
        [[ "$src" =~ ^# ]] && continue

        local resolved
        if resolved="$(resolve_src "$src")"; then
            cp "$resolved" "$output_dir/"
            [ "${VERBOSE:-false}" = true ] && echo "  + $src ($resolved)"
        fi
    done < "$manifest"

    # Create zip
    if [ -d "$output_dir" ]; then
        create_zip "$output_dir" "$zip_file"
        success "Claude Code bundle: $zip_file ($agent_count agents)"
    fi
}

build_chatgpt() {
    local manifest="$MANIFEST_DIR/gpt_runpack_v1.md"
    local output_dir="$DIST_DIR/chatgpt"
    local zip_file="$DIST_DIR/innerlight-v2-chatgpt.zip"

    info "Building ChatGPT bundle..."

    mkdir -p "$output_dir/contracts"
    mkdir -p "$output_dir/agents"

    # Primary: central-orchestrator as system-prompt.txt
    local orch
    if orch="$(resolve_src "central-orchestrator.md")"; then
        cp "$orch" "$output_dir/system-prompt.txt"
        success "  + system-prompt.txt (Central Orchestrator)"
    fi

    # Copy optional support agents
    local support_agents=(
        "build-coordinator.md"
        "distribution-coordinator.md"
        "architect.md"
        "code-developer.md"
        "qa-testing.md"
        "marketing-strategy.md"
        "content-creation.md"
        "devops.md"
        "security.md"
        "analytics.md"
        "customer-insight.md"
        "truth_agent.md"
    )

    for agent in "${support_agents[@]}"; do
        local resolved
        if resolved="$(resolve_src "$agent")"; then
            cp "$resolved" "$output_dir/agents/${agent%.md}.txt"
            [ "${VERBOSE:-false}" = true ] && echo "  + agents/$agent"
        fi
    done

    # Copy contracts
    for c in failure-packet-contract.md trace-emitter-contract.md loop-termination-contract.md; do
        local resolved
        if resolved="$(resolve_src "$c")"; then cp "$resolved" "$output_dir/contracts/"; else warn "$c not found"; fi
    done

    # Copy docs
    for d in README.md getting-started-chatgpt.md; do
        local resolved
        if resolved="$(resolve_src "$d")"; then cp "$resolved" "$output_dir/"; else warn "$d not found"; fi
    done

    if [ -d "$output_dir" ]; then
        create_zip "$output_dir" "$zip_file"
        success "ChatGPT bundle: $zip_file"
    fi
}

build_api() {
    local manifest="$MANIFEST_DIR/api_runpack_v1.md"
    local output_dir="$DIST_DIR/api"
    local zip_file="$DIST_DIR/innerlight-v2-api.zip"

    info "Building API bundle..."

    mkdir -p "$output_dir/system_prompts"
    mkdir -p "$output_dir/contracts"

    # Copy all agent files (recursive under agents/)
    local agent_count=0
    while IFS= read -r agent_file; do
        [ -f "$agent_file" ] || continue
        local filename="$(basename "$agent_file")"
        # Rename .md → .txt for API usage
        cp "$agent_file" "$output_dir/system_prompts/${filename%.md}.txt"
        ((agent_count++)) || true
    done < <(list_agent_files)

    # Copy contracts
    for contract in failure-packet-contract trace-emitter-contract loop-termination-contract; do
        local resolved
        if resolved="$(resolve_src "${contract}.md")"; then
            cp "$resolved" "$output_dir/contracts/"
        fi
    done

    # Copy docs
    for d in CLAUDE.md README.md; do
        local resolved
        if resolved="$(resolve_src "$d")"; then cp "$resolved" "$output_dir/"; else warn "$d not found"; fi
    done

    if [ -d "$output_dir" ]; then
        create_zip "$output_dir" "$zip_file"
        success "API bundle: $zip_file ($agent_count agents)"
    fi
}

build_cli() {
    local output_dir="$DIST_DIR/cli"
    local zip_file="$DIST_DIR/innerlight-v2-cli.zip"

    info "Building CLI bundle..."

    mkdir -p "$output_dir/agents"
    mkdir -p "$output_dir/contracts"
    mkdir -p "$output_dir/bin"

    # Copy all agent .md files as .sh scripts (recursive under agents/)
    local agent_count=0
    while IFS= read -r agent_file; do
        [ -f "$agent_file" ] || continue
        local filename="$(basename "$agent_file")"
        # Create shell wrapper from agent prompt
        cat > "$output_dir/agents/${filename%.md}.sh" <<WRAPPER
#!/bin/bash
# Agent: ${filename%.md}
# This script loads the agent prompt and calls the configured LLM API

set -e

AGENT_PROMPT="\$(cat "\$(dirname "\$0")/${filename%.md}.md" 2>/dev/null || cat "\$(dirname "\$0")/${filename%.md}.sh" 2>/dev/null)"
USER_TASK="\$*"

# Call the LLM with the agent prompt
call_llm() {
    local system="\$1"
    local user="\$2"

    if [ -n "\${OPENAI_API_KEY:-}" ]; then
        curl -s https://api.openai.com/v1/chat/completions \\
            -H "Authorization: Bearer \${OPENAI_API_KEY}" \\
            -H "Content-Type: application/json" \\
            -d "$(jq -n --arg system "$system" --arg user "$user" '{
                model: "\${INNERLIGHT_MODEL:-gpt-4}",
                messages: [
                    {"role": "system", "content": $system},
                    {"role": "user", "content": $user}
                ]
            }')" | jq -r '.choices[0].message.content'
    elif [ -n "\${ANTHROPIC_API_KEY:-}" ]; then
        curl -s https://api.anthropic.com/v1/messages \\
            -H "Authorization: Bearer \${ANTHROPIC_API_KEY}" \\
            -H "Content-Type: application/json" \\
            -H "x-api-key: \${ANTHROPIC_API_KEY}" \\
            -d "$(jq -n --arg system "$system" --arg user "$user" '{
                model: "\${INNERLIGHT_MODEL:-claude-opus-4-7}",
                max_tokens: 4096,
                messages: [{"role": "user", "content": $user}],
                system: $system
            }')" | jq -r '.content[0].text'
    else
        echo "Error: Set OPENAI_API_KEY or ANTHROPIC_API_KEY"
        exit 1
    fi
}

if [ -z "\${USER_TASK}" ]; then
    echo "Usage: \$(basename "\$0") <task description>"
    exit 1
fi

call_llm "\${AGENT_PROMPT}" "\${USER_TASK}"
WRAPPER
        chmod +x "$output_dir/agents/${filename%.md}.sh"
        ((agent_count++))
    done < <(list_agent_files)

    # Create main CLI wrapper
    cat > "$output_dir/bin/innerlight" <<'WRAPPER'
#!/bin/bash
# AI Dream Team CLI — Central Orchestrator entry point

set -e

COMMANDS=(
    "orchestrate:central-orchestrator"
    "research:research-coordinator"
    "build:build-coordinator"
    "operate:operate-coordinator"
    "distribute:distribution-coordinator"
    "learn:learning-coordinator"
    "architect:architect"
    "code-developer:code-developer"
    "qa-testing:qa-testing"
    "devops:devops"
    "security:security"
    "analytics:analytics"
    "package:distribution-packager"
)

show_help() {
    cat <<EOF
innerlight — AI Dream Team CLI

Usage: innerlight <command> [args]

Commands:
  orchestrate <task>     Route through Central Orchestrator
  research <task>        Route to Research layer
  build <task>          Route to Build layer
  operate <task>         Route to Operate layer
  distribute <task>     Route to Distribution layer
  learn <task>           Route to Learning layer
  package <host>         Build a distribution bundle
  queue                 Show open Supabase tickets

Examples:
  innerlight orchestrate "validate my startup positioning"
  innerlight build "write a landing page"
  innerlight package claude

Environment:
  OPENAI_API_KEY        Required for OpenAI API
  ANTHROPIC_API_KEY     Required for Anthropic API
  SUPABASE_URL          Supabase project URL
  SUPABASE_KEY          Supabase anon key
EOF
}

COMMAND="${1:-}"
shift

case "$COMMAND" in
    orchestrate|research|build|operate|distribute|learn)
        [ -z "$*" ] && { show_help; exit 1; }
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        AGENT_SH="$SCRIPT_DIR/../agents/${COMMANDS[$COMMAND]#*:}.sh"
        if [ -f "$AGENT_SH" ]; then
            "$AGENT_SH" "$@"
        else
            echo "Error: Agent script not found: $AGENT_SH"
            exit 1
        fi
        ;;
    package)
        echo "Run: ../make-package.sh ${1:-claude}"
        ;;
    queue)
        if [ -z "${SUPABASE_URL:-}" ]; then
            echo "Error: SUPABASE_URL not set"
            exit 1
        fi
        echo "Tickets (open):"
        curl -s "${SUPABASE_URL}/rest/v1/tickets?status=eq.open&select=*" \
            -H "apikey: ${SUPABASE_KEY:-}" \
            -H "Authorization: Bearer ${SUPABASE_KEY:-}" | jq .
        ;;
    *)
        show_help
        ;;
esac
WRAPPER
    chmod +x "$output_dir/bin/innerlight"

    # Copy contracts
    for contract in failure-packet-contract trace-emitter-contract loop-termination-contract; do
        local resolved
        if resolved="$(resolve_src "${contract}.md")"; then
            cp "$resolved" "$output_dir/contracts/"
        fi
    done

    # Copy docs
    for d in README.md deployment_guide.md; do
        local resolved
        if resolved="$(resolve_src "$d")"; then cp "$resolved" "$output_dir/"; else warn "$d not found"; fi
    done

    if [ -d "$output_dir" ]; then
        create_zip "$output_dir" "$zip_file"
        success "CLI bundle: $zip_file ($agent_count agents)"
    fi
}

build_local() {
    local output_dir="$SOURCE_DIR/.claude/agents"
    info "Refreshing local subagents at $output_dir ..."

    mkdir -p "$output_dir"

    # Wipe existing .md files (preserve non-md config if any)
    find "$output_dir" -maxdepth 1 -type f -name '*.md' -delete 2>/dev/null || true

    # Copy every agent file flat
    local agent_count=0
    while IFS= read -r agent_file; do
        [ -f "$agent_file" ] || continue
        cp "$agent_file" "$output_dir/"
        [ "${VERBOSE:-false}" = true ] && echo "  + $(basename "$agent_file")"
        ((agent_count++)) || true
    done < <(list_agent_files)

    success "Local subagents refreshed: $output_dir ($agent_count agents)"
    info "Reload Claude Code or rerun /agents to pick them up."
}

#-------------------------------------------------------------------------------
# Dry run — list files without creating
#-------------------------------------------------------------------------------

dry_run() {
    local host="$1"
    local manifest_key="${MANIFEST_MAP[$host]:-$host}"
    local manifest="$MANIFEST_DIR/${manifest_key}_runpack_v1.md"
    info "DRY RUN — $1 bundle — files that would be included:"
    echo ""

    if [ ! -f "$manifest" ]; then
        error "Manifest not found: $manifest"
    fi

    while IFS= read -r file; do
        [ -z "$file" ] && continue

        if resolved="$(resolve_src "$file")"; then
            echo -e "  ${GREEN}+${NC} $file  ${BLUE}->${NC} ${resolved#$SOURCE_DIR/}"
        else
            echo -e "  ${RED}?${NC} $file ${RED}(MISSING)${NC}"
        fi
    done < <(parse_manifest "$manifest")
    echo ""
    success "Dry run complete — no files created"
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------

main() {
    local host="${1:-}"
    local dry_run_flag=false
    VERBOSE=false

    # Parse flags
    for arg in "$@"; do
        case "$arg" in
            --dry-run) dry_run_flag=true ;;
            --verbose) VERBOSE=true ;;
            --help|-h) usage ;;
        esac
    done

    # Validate host
    case "$host" in
        claude|chatgpt|api|cli|local) ;;
        all)
            [ "$dry_run_flag" = true ] && { dry_run claude; dry_run chatgpt; dry_run api; dry_run cli; exit 0; }
            info "Building all bundles..."
            build_claude
            build_chatgpt
            build_api
            build_cli
            success "All bundles complete — see $DIST_DIR"
            exit 0
            ;;
        *) usage ;;
    esac

    # Dry run
    if [ "$dry_run_flag" = true ]; then
        dry_run "$host"
        exit 0
    fi

    # Create output directory
    mkdir -p "$DIST_DIR"

    # Build selected host
    case "$host" in
        claude)   build_claude ;;
        chatgpt)  build_chatgpt ;;
        api)      build_api ;;
        cli)      build_cli ;;
        local)    build_local; exit 0 ;;
    esac

    success "Done — output in $DIST_DIR"
}

main "$@"
