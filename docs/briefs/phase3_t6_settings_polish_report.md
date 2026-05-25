# Phase 3 T6 — Settings Polish Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates).** Signed-in browser walk pending Felix.

Settings landing and Members page both polished against existing Phase 0 schema. No new tables, no service-role reads, no production-email claims, no destructive member management. The dev-safe invite caveat is now stated explicitly next to the invite form.

## 2. Files changed

Modified:
- `app/src/app/w/[slug]/settings/page.tsx` — full rewrite. Header with breadcrumb (workspace → Settings). 6-cell metadata strip: name, slug, plan, created, member count, your role. 2×2 area grid: Members (Live), Workspace profile (Read-only), Billing (Phase 4), Connectors (Phase 5) — each card includes a status chip and a short, honest description.
- `app/src/app/w/[slug]/settings/members/page.tsx` — full rewrite. Header with breadcrumb (workspace → Settings → Members) and member count. Three sections: Current members (live list from `workspace_members`, role badges, self marked, joined date, RLS note about hidden display names), Send an invite (existing `InviteForm` with explicit dev-email caveat above it), Pending + recent invites (now with pending/accepted/expired counts and role badges + sent/expires dates).

Untouched (dirty in worktree, flagged by brief as unrelated — left as-is):
- `app/src/app/(auth)/layout.tsx`
- `app/src/app/globals.css`
- `app/src/app/layout.tsx`

No new component, no library, no migration, no edits to `InviteForm`, no edits to `actions/invites.ts`, no edits to `WorkspaceNav.tsx`.

## 3. Routes

- `/w/[slug]/settings` (existing — rewritten content)
- `/w/[slug]/settings/members` (existing — rewritten content)

Auth posture unchanged. Both pages explicitly call `supabase.auth.getUser()` and `redirect('/signin')` on missing user (already present), plus the parent workspace layout guard. Unknown workspace ⇒ `notFound()`.

## 4. Data sources queried

### Settings landing
| Table | Columns | Filter | Notes |
|---|---|---|---|
| `workspaces` | `id, name, slug, plan, created_at` | `slug = :slug` | RLS: workspace_member |
| `workspace_members` | count | `workspace_id` | `head:true, count:'exact'` |
| `workspace_invites` | count | `workspace_id` | RLS: owner/admin only; `count` is `null` for non-admins → UI hides the invite count |
| `workspace_members` | `role` | `workspace_id, user_id = auth.uid()` | "Your role" cell |

### Members page
| Table | Columns | Filter | Notes |
|---|---|---|---|
| `workspaces` | `id, slug, name` | `slug = :slug` | |
| `workspace_members` | `user_id, role, joined_at, invited_by` | `workspace_id`, order by `joined_at asc` | RLS: member |
| `users_profile` | `display_name` | `id = auth.uid()` | RLS is self-only, so only the caller's display name is resolvable; other members render as truncated UUIDs |
| `workspace_invites` | `id, email, role, expires_at, accepted_at, created_at` | `workspace_id`, order by `created_at desc` | RLS: owner/admin |

All queries use `createSupabaseServerClient()` (session client, RLS-enforced). No `service_role` usage.

## 5. Settings landing behavior

- **Header**: workspace eyebrow (links Home) → `Settings`, subtitle "Workspace configuration. Read-only for everything except member invites."
- **Metadata strip** (responsive 2/3 columns): Name, Slug, Plan, Created (locale date), Members (count), Your role.
- **Areas grid** (2 columns):
  - **Members** — clickable card to `/settings/members`. Shows live `Live` chip and a quick stat: `{N} member(s)` plus `· {M} invite(s)` when the caller is owner/admin (skipped when RLS hides the count).
  - **Workspace profile** — disabled card, `Read-only` chip. Name and slug listed, editing not wired.
  - **Billing** — disabled card, `Phase 4` chip. Shows the current `plan` value verbatim; explicitly states no billing meter or budget.
  - **Connectors** — disabled card, `Phase 5` chip. Names Drive/Slack as future scope; explicitly states no OAuth wired.
- **Footer**: "RLS-gated session reads only — no service-role bypass."

## 6. Members page behavior

- **Header**: workspace → Settings → Members breadcrumb, member-count subtitle.
- **Current members**: divided list. Each row shows a colored `RoleBadge` (`owner` violet, `admin` sky, `member` neutral), a label, and a right-aligned `joined {date}`.
  - Self row label is `{display_name} (you)` when `users_profile.display_name` is set, otherwise `{auth.email} (you)`, falling back to `user {uuid8}…`.
  - Other rows show `user {uuid8}…` — explicit footnote explains the RLS reason ("`users_profile` is self-only").
- **Send an invite**: existing `InviteForm` preserved. Added inline caveat above the form: "No production email provider is configured: the invite URL is logged to the server console and shown inline below the form so you can copy and share it manually."
- **Pending + recent invites**: pending/accepted/expired counts in the header. Per row: email, `RoleBadge`, sent date, expires date, right-aligned status chip (pending amber / accepted emerald / expired neutral). When the caller is non-admin and RLS denies the read, shows "Invites are visible to owners and admins only." When admin and zero invites, shows "No invites yet."

## 7. Invite caveats

- Inline caveat above the invite form names the dev-safe behavior explicitly (server console log + inline URL display) and disclaims production email setup.
- The pending-invites empty/denied states are honest about RLS (`owners and admins only`).
- Member display name caveat ("hidden by RLS") sits at the bottom of the members card.
- All three caveats match the actual `sendInvite` + `users_profile` + `workspace_invites_admin_select` behavior; nothing is over-claimed.

## 8. Browser / curl smoke

Dev server (`pnpm dev`, webpack) running on `http://localhost:3000`. Unauthenticated probes:

```
settings: 307 -> http://localhost:3000/signin
members:  307 -> http://localhost:3000/signin
```

Workspace layout guard plus the in-page `redirect('/signin')` enforce auth, so unauthenticated traffic never reaches data reads.

**Signed-in walk (pending Felix):**
1. `/w/<slug>/settings` renders the 6-cell metadata strip with real values for `name`, `slug`, `plan`, `created`, member count, and "Your role".
2. Areas grid shows Members card with member/invite counts; clicking it routes to `/settings/members`.
3. Workspace profile / Billing / Connectors render disabled with their respective chips.
4. `/w/<slug>/settings/members` shows the current member list with role badges; the signed-in user is marked `(you)`.
5. Invite form still works (existing `InviteForm`); after a successful invite the inline URL block appears.
6. Pending + recent invites lists the invite with counts in the header.
7. `Settings` is the active nav strip item on both pages.
8. Sign out → both routes 307 to `/signin`.
9. Non-admin walk: invite section reads "Invites are visible to owners and admins only." and the Settings landing card hides the `invite(s)` count.

## 9. Validation output (exact pass lines)

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
**Not run.** No migration changed in this ticket; migration set `0001..0005` unchanged from T5. `supabase test db` against the live local DB proves schema integrity.

## 10. Unrelated dirty files

`git status --short` after edits:

```
 M src/app/(auth)/layout.tsx        (unchanged by T6)
 M src/app/globals.css              (unchanged by T6)
 M src/app/layout.tsx               (unchanged by T6)
 M src/app/w/[slug]/settings/members/page.tsx   (T6)
 M src/app/w/[slug]/settings/page.tsx           (T6)
?? ../docs/briefs/phase3_t6_settings_polish_claude_brief.md
```

The three flagged files (`(auth)/layout.tsx`, `globals.css`, `layout.tsx`) were **not** staged, reverted, or modified by this ticket. Only the two settings pages and this report are T6's output.

## 11. Hard-boundary checklist

| Boundary | Status |
|---|---|
| No schema migration | ✔ |
| No model call | ✔ |
| No connector / OAuth | ✔ |
| No billing implementation | ✔ — copy explicitly disclaims |
| No token-budget implementation | ✔ |
| No service-role UI reads | ✔ — `createSupabaseServerClient()` only |
| No production email provider claim | ✔ — caveat states dev-safe console + inline URL |
| No destructive member management | ✔ — list only |
| Dirty unrelated files left untouched | ✔ — see §10 |
| RLS posture preserved | ✔ — same `users_profile` self-only, `workspace_invites` owner/admin |

## 12. Known caveats

1. **Non-self display names hidden.** `users_profile` RLS is `id = auth.uid()`. Without an admin-scoped view of profiles (would require a new SECURITY DEFINER RPC + RLS test), member rows show truncated UUIDs. Documented in-page.
2. **Invite-count visibility split.** Owners/admins see the invite count on the Settings landing; non-admins do not (RLS denies, count is `null`). Intentional — matches `workspace_invites_admin_select`.
3. **No invite revoke/resend.** Read-only list. Out of scope ("no destructive member management"). Would need an `update` policy interaction or a new RPC.
4. **No member-role edit / remove.** Same — explicit boundary.
5. **No Playwright.** Still deferred per prior phase tickets.

## 13. Next recommended step

**Phase 3 closeout acceptance.** Phase 3 T1–T6 are now in:
- T1 nav + route skeleton
- T2 agent catalog
- T3 agent detail
- T4 contracts viewer
- T5 history page
- T6 settings polish (this ticket)

A short Phase 3 acceptance pass — operator walk of each route + a phase-level report mirroring the Phase 2 acceptance shape — is the natural next step before Phase 4 (failure inspector / retries / budgets).

## 14. Final status

**Phase 3 T6 — PASS (code gates). Live operator acceptance pending Felix walk per §8. All automated gates green: copy-smoke 20/20, model-smoke 13/13, typecheck, lint, verify-supabase-project, pgtap (Files=7, Tests=59, PASS). No schema change; `supabase db reset` not re-run. Settings landing rebuilt with workspace metadata strip + status-chipped area grid; Members page rebuilt with role-badged member list, dev-safe invite caveat, and counted invite status list. Unrelated dirty files (auth layout, globals.css, root layout) were not touched.**
