# Phase 3 T2 — Agent Catalog Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates).** Signed-in browser walk pending Felix, same protocol as T1.

`/w/[slug]/agents` now renders a real read-only catalog parsed from the canonical prompt library at `agents/`. 28 agents grouped into 8 sections (Orchestrator, Coordinators, the five Specialist layers, Packager). Workspace lookup, RLS posture, and nav active state are unchanged from T1. No execution surface added. No schema change. No new dependency.

## 2. Files changed

Created:
- `app/src/lib/agents/catalog.ts` — server-only loader (`import 'server-only'`). Walks `<repo>/agents/**/*.md`, parses minimal frontmatter (`name:`, `description:`), derives title from first `# heading`, derives summary from frontmatter `description` (preferred) or first non-empty paragraph, maps folder path → group, returns sorted typed entries and a `groupAgents()` helper that bucketizes by canonical group order.
- `app/src/components/agents/AgentCatalog.tsx` — presentational RSC. No FS access. Renders group sections + per-agent card (title, slug, summary, source path, disabled Detail · T3 chip).

Modified:
- `app/src/app/w/[slug]/agents/page.tsx` — replaces T1 placeholder rows. Same workspace lookup + `notFound()` gate. Calls `loadAgentCatalog()` and renders `<AgentCatalog>`.

No migration. No new dependency. `package.json` unchanged. `WorkspaceNav.tsx`, `WorkspaceFrame.tsx`, layout/auth guards untouched.

## 3. Catalog source selected and why

**Source: `agents/` (canonical tree).** Chosen over `.claude/agents/` because folder structure (`orchestrator/`, `coordinators/`, `specialists/{build,research,operate,distribution,learning}/`, `packager/`) gives deterministic group classification with no name-based heuristics. `.claude/agents/` is a flat mirror — same 28 files but loses the layer signal. Both contain the same YAML frontmatter (`name:`, `description:`) so parsing rules are identical; the canonical tree is just strictly more informative.

The app already promises in `app/AGENTS.md` that the prompt library is **not consumed at build time** — `loadAgentCatalog()` runs at request time inside an RSC, so this stays consistent.

## 4. Agent count and group counts

```
total: 28

Orchestrator                1
Coordinators                5
Build Specialists           5
Research Specialists        4
Operate Specialists         4
Distribution Specialists    4
Learning Specialists        4
Packager                    1
```

Confirmed by direct walk of `agents/` from repo root.

## 5. Parsing rules used

Conservative, deterministic:

1. **Frontmatter:** if file starts with `---`, scan until the closing `---`, capture `key: value` lines into a flat map. No nested YAML. Unknown keys ignored. (`truth_agent.md`'s extra `archetype:` field is read into the map and ignored downstream.)
2. **Slug:** `frontmatter.name` if present, else filename minus `.md`. E.g. `truth_agent.md` → `runtime-truth-keeper` (from frontmatter), `central-orchestrator.md` → `central-orchestrator`.
3. **Title (rendered name):** first `# Heading` in the body; falls back to slug. E.g. `# CENTRAL ORCHESTRATOR`, `# Truth Agent`.
4. **Summary:** prefer `frontmatter.description`. Fallback: first non-empty paragraph after the title (skipping `#` and `---` lines). Whitespace collapsed; clipped to 320 chars with an ellipsis. Never invented — if both sources are empty the summary is empty and the source path is shown for audit.
5. **Group:** derived only from the relative path prefix. Hard-coded map in `groupFromRelPath()`. No name-based classifier.
6. **Source path:** `agents/<relative/path>.md` with forward slashes for cross-platform consistency.

## 6. UI behavior

Dark operator style preserved. Page header: workspace name (eyebrow), `Agents` H1, one-line subtitle. Below: subtle meta line ("28 agents across 8 groups. Read-only catalog from `agents/`. Detail pages arrive in Phase 3 T3.").

Each group section: small section header (group name + count) above a bordered list. Each agent card:

- Title (frontmatter-derived).
- Slug (monospace, muted).
- `Detail · T3` chip on the right — `aria-disabled="true"`, title-tooltip explains it lands in T3, not a link.
- Summary paragraph (skipped if empty).
- Source path in muted monospace, e.g. `agents/specialists/build/architect.md`.

No search/filter, no client state. Pure server render. The list is alphabetical inside each group; groups follow the canonical order (Orchestrator → Coordinators → Build → Research → Operate → Distribution → Learning → Packager).

## 7. Browser / curl smoke

Dev server running on `http://localhost:3000` (existing process). Unauth probes:

```
GET /w/probe/agents   → 307 → /signin
GET /w/probe/history  → 307
GET /signin           → 200
```

Behavior matches T1 — every workspace route enters through the existing layout guard before the catalog loader runs.

**Signed-in walk (operator, pending Felix):**

1. Sign in, navigate to `/w/<slug>/agents`. Nav strip highlights **Agents** (unchanged from T1).
2. Page shows the 28-agent catalog with all 8 group sections in canonical order. The eyebrow shows the workspace name.
3. `central-orchestrator` appears under **Orchestrator** with its frontmatter description as summary, sourced from `agents/orchestrator/central-orchestrator.md`.
4. `architect`, `code-developer`, `qa-testing`, `ux-designer`, `runtime-truth-keeper` appear under **Build Specialists**.
5. `runtime-truth-keeper` shows under Build Specialists with the truth-agent description (frontmatter slug ≠ filename — confirms the frontmatter-name rule).
6. Detail chip is greyed and non-interactive on every card.
7. `/w/<other-slug>/agents` renders the same catalog (data is library-wide; the workspace lookup just gates access).
8. Sign out → `/signin`. Re-hitting `/w/<slug>/agents` returns 307 to `/signin`.

## 8. Validation output (exact pass lines)

### `pnpm copy:smoke`
```
copy-smoke: OK (20 checks)
```
All 20 honest-copy assertions from T1 still pass — including the agents page, which no longer says "stub" anywhere.

### `pnpm model:smoke`
```
model-smoke: OK (13 checks)
```

### `pnpm typecheck`
Exit 0. No diagnostics.

### `pnpm lint`
Exit 0. No diagnostics.

### `pnpm verify:supabase-project`
```
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

### `pnpm exec supabase test db`
```
Files=7, Tests=59,  Result: PASS
```

### `pnpm exec supabase db reset`
**Not run.** No migration changed in this ticket; the 0001..0005 migration set is unchanged from T1. `supabase test db` against the live local DB is the proof of schema integrity.

## 9. Hard-boundary checklist

| Boundary | Status |
|---|---|
| No schema migration | ✔ |
| No model call | ✔ |
| No agent execution | ✔ — catalog is read-only |
| No prompt editing | ✔ — files only read |
| No connector / OAuth | ✔ |
| No new DB table | ✔ |
| No Agent Detail page | ✔ — disabled chip only |
| No Contract Viewer | ✔ — deferred to T4 |
| Agent markdown files unmoved | ✔ |
| No new dependency | ✔ |
| RLS / auth posture preserved | ✔ — every read goes through existing layout guard + session client |
| Service-role bypass | ✔ — not introduced |

## 10. Known caveats

1. **Filesystem read at request time.** `loadAgentCatalog()` calls `fs.readdir` / `fs.readFile` from `<app-cwd>/../agents`. Works in `next dev` and `next build` on the same checkout. If the deploy target ever ships `app/` without the sibling `agents/` directory, the page will throw. A future ticket can either bake the catalog into a JSON build artifact (`scripts/build-agent-catalog.mjs`) or move the loader behind `unstable_cache`. Out of scope here.
2. **Minimal frontmatter parser.** Hand-rolled `key: value` scanner — no nested YAML, no multi-line values. Sufficient for the current 28 files; would need replacement (e.g. `yaml` package) if frontmatter shape grows.
3. **Truth Agent slug.** `agents/specialists/build/truth_agent.md` has `name: runtime-truth-keeper` in its frontmatter — the catalog therefore lists it as `runtime-truth-keeper`, not `truth_agent`. This is intentional (frontmatter wins) and the source path is shown for audit.
4. **No Playwright.** Still deferred per T1.

## 11. Next recommended ticket

**Phase 3 T3 — Agent Detail.** Loader already returns enough metadata to support a `/w/[slug]/agents/[agentId]` route keyed on slug. T3 can: (a) extend `catalog.ts` with a `loadAgent(slug)` that returns full body sections (Identity / Core Function / Boundaries / Stop Condition), (b) render those sections read-only, (c) replace the disabled Detail chip with a real `<Link>`. Optional companion: a small Playwright nav-and-catalog smoke once the route exists.

## 12. Final status

**Phase 3 T2 — PASS (code gates). Live operator acceptance pending Felix walk-through per §7. All automated gates green: copy-smoke 20/20, model-smoke 13/13, typecheck, lint, verify-supabase-project, pgtap (Files=7, Tests=59, PASS). No schema change; `supabase db reset` not re-run because no migration changed. 28 agents catalogued from `agents/` across 8 groups, no execution surface, no prompt mutation.**
