# AI Dream Team — GNU Makefile
#
# Provides `make` interface as an alternative to make-package.sh
#
# Targets:
#   make build/<host>   Build a specific bundle (claude, chatgpt, api, cli)
#   make build/all       Build all bundles
#   make dry-run/<host>  Preview bundle without creating files
#   make clean           Remove all built distributions
#   make list            Show available bundles
#
# Hosts: claude, chatgpt, api, cli, all
#
# Examples:
#   make build/claude     # build Claude Code bundle
#   make build/all        # build everything
#   make dry-run/chatgpt  # preview ChatGPT bundle

SHELL := bash
.SUFFIXES:

# Configuration
SCRIPT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
DIST_DIR := $(SCRIPT_DIR)/distributions/portable
MANIFEST_DIR := $(SCRIPT_DIR)/distributions/manifests
SOURCE_DIR := $(SCRIPT_DIR)

# Hosts
HOSTS := claude chatgpt api cli

# Colors
GREEN  := $(shell tput setaf 2 2>/dev/null || echo '')
YELLOW := $(shell tput setaf 3 2>/dev/null || echo '')
BLUE   := $(shell tput setaf 4 2>/dev/null || echo '')
NC     := $(shell tput sgr0 2>/dev/null || echo '')

# Helper: info/echo
info    = @echo '$(BLUE)[INFO]$(NC)' $1
success = @echo '$(GREEN)[OK]$(NC)' $1
warn    = @echo '$(YELLOW)[WARN]$(NC)' $1

.PHONY: build/all build/claude build/chatgpt build/api build/cli \
        dry-run/claude dry-run/chatgpt dry-run/api dry-run/cli \
        clean list help

#-----------------------------------------------------------------------------
# Build targets
#-----------------------------------------------------------------------------

build/all: $(addprefix build/,$(HOSTS))
	$(success) "All bundles complete — see $(DIST_DIR)/"

build/claude:
	$(info) "Building Claude Code bundle..."
	@mkdir -p $(DIST_DIR)
	@bash $(SCRIPT_DIR)/make-package.sh claude

build/chatgpt:
	$(info) "Building ChatGPT bundle..."
	@mkdir -p $(DIST_DIR)
	@bash $(SCRIPT_DIR)/make-package.sh chatgpt

build/api:
	$(info) "Building API bundle..."
	@mkdir -p $(DIST_DIR)
	@bash $(SCRIPT_DIR)/make-package.sh api

build/cli:
	$(info) "Building CLI bundle..."
	@mkdir -p $(DIST_DIR)
	@bash $(SCRIPT_DIR)/make-package.sh cli

#-----------------------------------------------------------------------------
# Dry-run targets
#-----------------------------------------------------------------------------

dry-run/claude:
	$(info) "Dry run — Claude Code bundle preview"
	@bash $(SCRIPT_DIR)/make-package.sh claude --dry-run

dry-run/chatgpt:
	$(info) "Dry run — ChatGPT bundle preview"
	@bash $(SCRIPT_DIR)/make-package.sh chatgpt --dry-run

dry-run/api:
	$(info) "Dry run — API bundle preview"
	@bash $(SCRIPT_DIR)/make-package.sh api --dry-run

dry-run/cli:
	$(info) "Dry run — CLI bundle preview"
	@bash $(SCRIPT_DIR)/make-package.sh cli --dry-run

#-----------------------------------------------------------------------------
# Utility targets
#-----------------------------------------------------------------------------

clean:
	$(info) "Removing distributions..."
	@rm -rf $(DIST_DIR)
	$(success) "Clean complete"

list:
	@echo "Available bundles:"
	@echo "  claude   — Claude Code subagent bundle (28 agents + contracts + docs)"
	@echo "  chatgpt  — ChatGPT system-prompt bundle (single file + optional agents)"
	@echo "  api      — API bundle (28 agents as separate system prompt files)"
	@echo "  cli      — CLI tool bundle (28 agent scripts + CLI wrapper)"
	@echo ""
	@echo "Run 'make help' for usage"

#-----------------------------------------------------------------------------
# Help
#-----------------------------------------------------------------------------

help:
	@echo "AI Dream Team — Makefile"
	@echo ""
	@echo "Usage:"
	@echo "  make build/<host>    Build a bundle (claude, chatgpt, api, cli)"
	@echo "  make build/all       Build all bundles"
	@echo "  make dry-run/<host>  Preview bundle without creating files"
	@echo "  make clean           Remove all built distributions"
	@echo "  make list            Show available bundles"
	@echo ""
	@echo "Hosts:"
	@echo "  claude   — Claude Code subagent bundle (28 agents + contracts + docs)"
	@echo "  chatgpt  — ChatGPT system-prompt bundle (single file + optional agents)"
	@echo "  api      — API bundle (28 agents as separate system prompt files)"
	@echo "  cli      — CLI tool bundle (28 agent scripts + CLI wrapper)"
	@echo ""
	@echo "Examples:"
	@echo "  make build/claude              # build Claude Code bundle"
	@echo "  make build/all                 # build all bundles"
	@echo "  make dry-run/chatgpt           # preview ChatGPT bundle"
	@echo "  make clean                    # remove all built artifacts"
	@echo ""
	@echo "Output:"
	@echo "  $(DIST_DIR)/innerlight-v2-<host>.zip"
	@echo "  $(DIST_DIR)/<host>/"