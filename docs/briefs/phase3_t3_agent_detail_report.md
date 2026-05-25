# Phase 3 T3 — Agent Detail Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates).** Signed-in browser walk pending Felix.

`/w/[slug]/agents/[agentId]` now renders a read-only profile per agent. Catalog cards became real links. T2 catalog behavior preserved (28 agents, 8 groups). No execution surface, no prompt mutation, no schema change, no new dependency.

## 2. Files changed

Modified:
- `app/src/lib/agents/catalog.ts` — added `AgentDetail` type (extends `AgentEntry` with raw `body`), refactored parse into a shared `parseAgent()` helper, added `loadAgentBySlug(slug)`. `loadAgentCatalog()` and `groupAgents()` signatures unchanged; the catalog page receives the same `AgentEntry[]` shape it did before.
- `app/src/components/agents/AgentCatalog.tsx` — accepts `linkPrefix` prop. Each card is now a `<Link>` to `${linkPrefix}/${encodeURIComponent(slug)}`. Disabled "Detail · T3" chip replaced with active "Detail →" chip. Hover border lift added; spacing unchanged.
- `app/src/app/w/[slug]/agents/page.tsx` — passes `linkPrefix={\`/w/${workspace.slug}/agents\`}` to `AgentCatalog`. Same workspace lookup + `notFound()` gate.

Created:
- `app/src/app/w/[slug]/agents/[agentId]/page.tsx` — RSC route. Same workspace lookup, calls `loadAgentBySlug(agentId)`, `notFound()` on miss.

No migration. No new dependency. `package.json`, `WorkspaceNav.tsx`, `WorkspaceFrame.tsx`, layout/auth guards untouched.

## 3. Route added

`/w/[slug]/agents/[agentId]`

- Slug lookup is workspace-scoped via the existing `workspaces` query; auth guard runs in the parent layout.
- Agent ID is matched against the frontmatter `name:` (preferred) or filename stem — same rule as the catalog, so the link from a catalog card always resolves.
- Unknown slug → Next.js `notFound()` (404).

## 4. Catalog/source behavior preserved

- Loader still walks `<repo>/agents/**/*.md`, parses same frontmatter, derives title/summary identically.
- Same 28 entries, same 8 groups, same canonical order.
- Slug rule unchanged: `truth_agent.md` still surfaces as `runtime-truth-keeper`. Detail link uses that slug; `/w/<slug>/agents/runtime-truth-keeper` resolves.
- Slug uniqueness verified: grep of frontmatter `name:` across `agents/` returned 28 distinct values.
- `parseAgent()` factored from prior inline parsing — output for catalog entries (everything except `body`) is byte-equivalent.

## 5. Detail page fields

| Field | Source |
|---|---|
| Back link `← Agents` | derived from workspace slug |
| Workspace eyebrow | `workspaces.name` |
| Title | `# Heading` from body, falls back to slug |
| Slug + group | catalog metadata |
| Summary | frontmatter `description` (preferred) or first paragraph |
| Source path | `agents/<rel>.md` |
| Group | folder-derived |
| Mode | static "Read-only" |
| Prompt source | raw post-frontmatter body, rendered inside `<pre>` |
| Footer note | "This page displays checked-in prompt source from `agents/`. It does not execute the agent." |

No "Run agent" / "Start workflow" buttons.

## 6. Safety / rendering choices

- Body rendered inside a `<pre class="whitespace-pre-wrap break-words ...">`. No `dangerouslySetInnerHTML`, no markdown-to-HTML converter, no new dependency.
- `max-h-[60vh] overflow-auto` caps long bodies; the orchestrator file (longest in the tree) scrolls cleanly.
- Slug param is URL-encoded by the catalog `<Link>`. Lookup is exact-match against the parsed slug, so a request for `../foo` or any non-matching string yields `notFound()` (no path traversal possible because the filesystem walk happens once and the slug is compared in-memory).
- Frontmatter is not rendered to the page — body slice already strips the `---` block.
- No related-contract parsing, no markdown link rewriting. Contract files referenced inside an agent body appear as plain text inside the `<pre>` block, which is fine for read-only inspection. Real Contract Viewer is Phase 3 T4.

## 7. Browser / curl smoke

Dev server (`pnpm dev`, webpack) running on `http://localhost:3000`. Unauth probes:

```
agents-list:    307 -> http://localhost:3000/signin
agents-detail:  307 -> http://localhost:3000/signin   (/w/probe/agents/central-orchestrator)
agents-unknown: 307 -> http://localhost:3000/signin   (/w/probe/agents/no-such-agent)
```

Auth guard runs in the parent layout, so unauthenticated traffic never reaches the route. Matches T1/T2 behavior — confirms the new route inherited the existing guard. `notFound()` for unknown-slug + signed-in user is enforced by the loader returning `null`; verified by code inspection (pending Felix walk).

**Signed-in walk (pending Felix):**

1. `/w/<slug>/agents` still renders 28 agents in 8 groups (T2 behavior).
2. Each card is a link; chip reads `Detail →` instead of `Detail · T3`.
3. Click `central-orchestrator` → `/w/<slug>/agents/central-orchestrator` with header, summary, metadata panel, full prompt body in a scroll-capped block, footer note.
4. Click `runtime-truth-keeper` → resolves at `/w/<slug>/agents/runtime-truth-keeper` (frontmatter-name slug, not filename).
5. `/w/<slug>/agents/no-such-agent` → 404.
6. Agents nav strip remains active on detail route (`WorkspaceNav` `Agents` `match` already covers `${base}/agents/...`).
7. Sign out → hitting any agent detail route 307s to `/signin`.

## 8. Validation output (exact pass lines)

### `pnpm copy:smoke`
```
copy-smoke: OK (20 checks)
```

### `pnpm model:smoke`
```
model-smoke: OK (13 checks)
```

### `pnpm verify:supabase-project`
```
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

### `pnpm typecheck`
Exit 0. No diagnostics.

### `pnpm lint`
Exit 0. No diagnostics.

### `pnpm exec supabase test db`
```
Files=7, Tests=59,  Result: PASS
```

### `pnpm exec supabase db reset`
**Not run.** No migration changed in this ticket; migration set 0001..0005 unchanged from T2. `supabase test db` against the live local DB proves schema integrity.

## 9. Hard-boundary checklist

| Boundary | Status |
|---|---|
| No schema migration | ✔ |
| No model call | ✔ |
| No connector / OAuth | ✔ |
| No agent execution | ✔ — read-only |
| No prompt editing | ✔ — files only read |
| No Contract Viewer | ✔ — deferred to T4 |
| No History implementation | ✔ — deferred to T5 |
| No broad catalog redesign | ✔ — minimal chip + link change |
| No `dangerouslySetInnerHTML` | ✔ — body rendered in `<pre>` |
| No new dependency | ✔ |
| RLS / auth posture preserved | ✔ — same layout guard + workspace lookup |
| Service-role bypass | ✔ — not introduced |

## 10. Known caveats

1. **Filesystem read at request time.** Inherited from T2. `loadAgentBySlug` re-walks `agents/` on each detail page request — fine for 28 files in dev/build; cacheable later if needed.
2. **Body is rendered verbatim as text.** Markdown formatting (headings, lists, tables) is not rendered into HTML. Trade-off chosen for safety + zero-dependency. A proper renderer can land in a later ticket if stakeholders ask for it.
3. **No previous/next nav within group.** Optional in the brief; skipped to keep diff small.
4. **No related-contract surfacing.** Skipped — would require a parser; Contract Viewer (T4) is the right home for any cross-link UX.
5. **No Playwright.** Still deferred per T1/T2.

## 11. Next recommended ticket

**Phase 3 T4 — Contracts Viewer.** Same shape as this ticket: read-only display of `contracts/{failure-packet,trace-emitter,loop-termination}-contract.md`. The detail-page pattern (workspace gate → file load → `<pre>` body) can be lifted directly. If contract cross-links are added on the agent detail page, T4 should land first so the targets exist.

## 12. Final status

**Phase 3 T3 — PASS (code gates). Live operator acceptance pending Felix walk per §7. All automated gates green: copy-smoke 20/20, model-smoke 13/13, typecheck, lint, verify-supabase-project, pgtap (Files=7, Tests=59, PASS). No schema change; `supabase db reset` not re-run. Detail route added at `/w/[slug]/agents/[agentId]`; catalog chips now real links; no execution surface introduced.**
