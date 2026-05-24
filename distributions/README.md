# Distribution Packages

This directory contains the output of the Distribution Packager — deployable bundles for each supported host platform.

## Quick Start

Run the packager from the project root:

```bash
cd ~/Desktop/dream_team
./make-package.sh <host>
```

### Available Hosts

| Host | Command | What You Get |
|------|---------|-------------|
| **Claude Code** | `./make-package.sh claude` | 28 agent files → `~/.claude/agents/` | 
| **ChatGPT** | `./make-package.sh chatgpt` | `system-prompt.txt` + optional agents |
| **API** | `./make-package.sh api` | 28 `.txt` system prompt files |
| **CLI** | `./make-package.sh cli` | Shell scripts + CLI wrapper |
| **All** | `./make-package.sh all` | All four bundles |

### Preview Without Creating Files

```bash
./make-package.sh claude --dry-run
```

Shows exactly which files would be included and which are missing — no files created.

### Verbose Output

```bash
./make-package.sh claude --verbose
```

Shows each file as it's copied.

## Output Location

All bundles are written to `distributions/portable/`:

```
distributions/portable/
├── innerlight-v2-claude.zip    # Claude Code bundle
├── claude/                       # flat output directory
├── innerlight-v2-chatgpt.zip    # ChatGPT bundle
├── chatgpt/                      # flat output directory
├── innerlight-v2-api.zip        # API bundle
├── api/                         # flat output directory
├── innerlight-v2-cli.zip        # CLI bundle
└── cli/                         # flat output directory
```

## Installation Per Host

### Claude Code

```bash
# Extract and install
unzip distributions/portable/innerlight-v2-claude.zip -d /tmp/innerlight
cp -r .claude/agents/* ~/.claude/agents/

# Verify
@central-orchestrator show my open tickets
```

### ChatGPT

```bash
# Extract
unzip distributions/portable/innerlight-v2-chatgpt.zip -d ~/Desktop/innerlight-chatgpt

# Option A — Web: paste the contents of system-prompt.txt into ChatGPT's custom instructions
# Option B — API: pass system-prompt.txt as the `system` parameter
```

### API

```bash
# Extract
unzip distributions/portable/innerlight-v2-api.zip -d ~/Desktop/innerlight-api

# Load agents as system prompts
python your_agent_router.py
```

### CLI

```bash
# Extract and install
unzip distributions/portable/innerlight-v2-cli.zip -d ~/innerlight-cli
export PATH="$HOME/innerlight-cli/bin:$PATH"
export OPENAI_API_KEY=your-key   # or ANTHROPIC_API_KEY

# Run
innerlight orchestrate "build a landing page for my startup"
```

## Requirements

- Bash 4+ (macOS, Linux, Git Bash on Windows)
- `zip` utility (available on all platforms)
- For API/CLI: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` environment variable
- For work queue: `SUPABASE_URL` and `SUPABASE_KEY`

## Manifests

Each bundle is defined by a manifest in `distributions/manifests/`:

```
distributions/manifests/
├── claude_runpack_v1.md   # Claude Code bundle definition
├── gpt_runpack_v1.md      # ChatGPT bundle definition
├── api_runpack_v1.md      # API bundle definition
└── cli_runpack_v1.md     # CLI bundle definition
```

To create a new bundle type, add a new manifest following the existing format, then add a corresponding `build_<host>()` function to `make-package.sh`.
