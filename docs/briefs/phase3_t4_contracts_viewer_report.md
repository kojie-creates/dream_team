# Phase 3 T4 — Contracts Viewer Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates).** Signed-in browser walk pending Felix.

Two new read-only routes (`/w/[slug]/contracts`, `/w/[slug]/contracts/[contractId]`) render the three canonical contracts checked into `contracts/`. Nav strip gains a `Contracts` item between Agents and History. No schema change, no execution surface, no markdown-to-HTML conversion, no new dependency.

## 2. Files changed

Created:
- `app/src/lib/contracts/catalog.ts` — server-only loader. Whitelisted slug set (`failure-packet-contract`, `trace-emitter-contract`, `loop-termination-contract`). Reads each `contracts/<slug>.md` directly by composed path; rejects any slug not in the whitelist. Parses title from `# heading`, status from `**Status:** …`, short excerpt from the Purpose section (or first body paragraph). Exposes `loadContractCatalog()`, `loadContractBySlug(slug)`, `contractSlugs()`.
- `app/src/components/contracts/ContractCatalog.tsx` — presentational card grid. Each card is a `<Link>` to `${linkPrefix}/${encodeURIComponent(slug)}`; shows title, "Read-only" chip, status, excerpt, source path.
- `app/src/app/w/[slug]/contracts/page.tsx` — RSC list route. Workspace lookup via `workspaces` query (same shape as Agents). `notFound()` on unknown workspace.
- `app/src/app/w/[slug]/contracts/[contractId]/page.tsx` — RSC detail route. Calls `loadContractBySlug(contractId)`; `notFound()` on miss. Renders header, metadata (source/status/mode), full source in a scroll-capped `<pre>`, footer note.

Modified:
- `app/src/components/workspace/WorkspaceNav.tsx` — added `Contracts` nav item between Agents and History. Match covers `${base}/contracts` and any nested route. No other nav changes.

No migration. No new dependency. `package.json`, `WorkspaceFrame.tsx`, layout/auth guards untouched.

## 3. Routes added

- `/w/[slug]/contracts`
- `/w/[slug]/contracts/[contractId]`

Auth guard runs in the parent workspace layout — same posture as T1/T2/T3. Workspace slug is queried server-side; unknown workspace ⇒ `notFound()`. Contract slug is matched against a whitelist before any filesystem read, so unknown contract ⇒ `notFound()`.

## 4. Contract count and source files

Count: **3**. Display order (Failure → Trace → Loop) reflects the contracts' logical chain (a failure produces a trace; loops are bounded across traces).

| Slug | Source path |
|---|---|
| `failure-packet-contract` | `contracts/failure-packet-contract.md` |
| `trace-emitter-contract` | `contracts/trace-emitter-contract.md` |
| `loop-termination-contract` | `contracts/loop-termination-contract.md` |

## 5. Navigation decision

Added **Contracts** as a sixth top-level nav item between **Agents** and **History**.

Rationale:
- `WorkspaceNav` already uses `overflow-x-auto` and `whitespace-nowrap`, so additional items degrade gracefully on narrow viewports rather than wrapping or breaking the shell.
- Six short labels (Home / Tickets / Agents / Contracts / History / Settings) still fit on a typical mobile width without scroll; on the narrowest devices the strip scrolls horizontally — the same behavior already accepted in T1.
- The alternative (Contracts cards seeded from Agents and Settings) would have required Agents/Settings edits and made contracts a second-class surface despite being a Phase 3 exit criterion ("contracts are viewable").

No broad shell redesign. The active-state pattern matches the other items; `Agents` active state is unchanged (its match still uses `${base}/agents`, not a broader prefix that would collide with `${base}/contracts`).

## 6. Safety / rendering choices

- **No markdown-to-HTML.** Contract bodies render verbatim inside `<pre class="whitespace-pre-wrap break-words ...">` with `max-h-[70vh] overflow-auto`. No `dangerouslySetInnerHTML`, no markdown renderer dependency.
- **Path safety.** `loadContractBySlug` rejects any slug not in `KNOWN_SLUGS` before touching the filesystem. Detail-page links go through `encodeURIComponent(slug)`. The detail-page lookup composes `contracts/<slug>.md` only after the whitelist check, so `..`, absolute paths, or any other string yield `notFound()` without filesystem access.
- **Metadata is parsed, not invented.** Title comes from the first `# heading`; status from a `**Status:** …` line; excerpt from the first non-heading paragraph under `## Purpose` (or first body paragraph). If a field is absent, the UI shows `—` (status) or falls back to the slug (title) — no hallucination.
- **Read-only.** No edit buttons, no form posts, no service-role reads, no mutation of the contract files.

## 7. Browser / curl smoke

Dev server (`pnpm dev`, webpack) running on `http://localhost:3000`. Unauthenticated probes:

```
list:    307 -> http://localhost:3000/signin
detail:  307 -> http://localhost:3000/signin   (/w/probe/contracts/trace-emitter-contract)
unknown: 307 -> http://localhost:3000/signin   (/w/probe/contracts/nope)
```

Parent workspace layout enforces auth, so unauthenticated traffic never reaches the route. `notFound()` for unknown contract + signed-in user is enforced by the whitelist (verified by code inspection; pending Felix walk).

**Signed-in walk (pending Felix):**

1. `/w/<slug>/contracts` renders 3 cards: Failure Packet, Trace Emitter, Loop Termination — each with status and short excerpt.
2. Card → detail route renders the full markdown source in a scroll-capped block; status reads "Canonical — do not modify without governance amendment".
3. `/w/<slug>/contracts/no-such-contract` → 404.
4. Nav strip shows `Contracts` highlighted on both list and detail.
5. Sign out → contract routes 307 to `/signin`.

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
**Not run.** No migration changed in this ticket; migration set 0001..0005 unchanged from T3. `supabase test db` against the live local DB proves schema integrity.

## 9. Hard-boundary checklist

| Boundary | Status |
|---|---|
| No schema migration | ✔ |
| No model call | ✔ |
| No connector / OAuth | ✔ |
| No contract editing | ✔ — files only read |
| No governance amendment workflow | ✔ |
| No runtime enforcement change | ✔ |
| No history implementation | ✔ — deferred to T5 |
| No broad navigation redesign | ✔ — single item added |
| No `dangerouslySetInnerHTML` | ✔ — `<pre>` text only |
| No markdown renderer dependency | ✔ |
| Path traversal | ✔ — slug whitelist before FS read |
| RLS / auth posture preserved | ✔ — same layout guard + workspace lookup |
| Service-role bypass | ✔ — not introduced |

## 10. Known caveats

1. **Filesystem read at request time.** Same pattern as T2/T3. Three small files; cacheable later if needed.
2. **Bodies render as plain text.** Headings, code fences, and tables inside the contracts appear as monospace markdown source. Trade-off chosen for safety + zero-dependency.
3. **No anchor links inside contract source.** Optional in the brief; skipped to keep diff small. The `<pre>` block is fully scrollable.
4. **No cross-links from Agent Detail.** Optional in the brief; skipped — agent bodies still surface contract filenames as plain text in the existing `<pre>` block.
5. **No Playwright.** Still deferred per prior phase tickets.

## 11. Next recommended ticket

**Phase 3 T5 — History Page.** Workspace-wide reverse-chronological view of briefs, tickets, runs, and trace events. RLS-backed reads (no service-role bypass). With Contracts now visible, traces emitted under the trace-emitter contract are the natural backbone for the history surface.

## 12. Final status

**Phase 3 T4 — PASS (code gates). Live operator acceptance pending Felix walk per §7. All automated gates green: copy-smoke 20/20, model-smoke 13/13, typecheck, lint, verify-supabase-project, pgtap (Files=7, Tests=59, PASS). No schema change; `supabase db reset` not re-run. Routes added at `/w/[slug]/contracts` and `/w/[slug]/contracts/[contractId]`; `Contracts` nav item added; whitelisted-slug loader prevents arbitrary FS reads; bodies rendered as text only.**
