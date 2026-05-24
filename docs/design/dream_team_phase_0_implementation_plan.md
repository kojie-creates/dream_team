# PHASE 0 IMPLEMENTATION PLAN
**From:** Build Coordinator
**System:** Dream Team v1 — Multi-tenant SaaS Dashboard
**Date:** 2026-05-23
**Designed against:** `docs/design/dream_team_v1_architecture_brief.md` §8 Phase 0, `docs/design/dream_team_first_run_ux_brief.md` §2–3

---

## Scope + non-goals

**In scope (Phase 0 only):** Repository initialization, Next.js 15 App Router scaffold under a new `app/` subdirectory of the existing prompt-library repo, Supabase project bring-up (local CLI + cloud dev), the four foundational tables (`users_profile`, `workspaces`, `workspace_members`, `workspace_invites`), RLS policies and per-table smoke tests, auth pages with magic link + Google OAuth, the 3-step onboarding flow (static content only), workspace creation + switcher, a protected `/w/[slug]` layout, the no-work-yet Home screen as a static shell, and an end-to-end smoke acceptance run.

**Explicitly deferred (Phase 1+):** `briefs`, `tickets`, `agent_runs`, `trace_events`, `packets`, `artifacts`, `connectors`, `connector_tokens` tables. Anthropic API integration. Orchestrator routing. Generate composer. Upload path. Agent Catalog. Agent Detail. Inspector. Trace view. Artifact viewer. Billing. Realtime / SSE. Edge Functions for `parse-brief`, `synthesize`, `run-orchestration`. `pg_cron`. Per-workspace rate limits. JWT custom claims (`active_workspace_id` injection). Starter prompt cards are rendered but inert.

**Boundary rule:** any work that touches a deferred table or endpoint is out of scope and must be re-routed by Build Coordinator into Phase 1 backlog.

---

## Prerequisites

**Accounts:** GitHub (for repo remote), Supabase (cloud — one org), Google Cloud (for OAuth client). Vercel optional in Phase 0 (local dev is sufficient).

**CLI versions (pinned):**
- Node.js 20.x LTS
- pnpm 9.x (package manager of record — see Open Decisions #2)
- Supabase CLI 1.200+ (for local stack + `supabase test db`)
- Docker Desktop (required by `supabase start`)
- Git 2.40+

**Environment variables (in `.env.local`, never committed):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `SUPABASE_JWT_SECRET` (for local middleware verification)
- `NEXT_PUBLIC_SITE_URL` (defaults `http://localhost:3000`)

A committed `.env.example` mirrors these with empty values.

**Decisions needed before starting** — see Open Decisions section. T0.1 cannot start until #1 and #2 are answered.

---

## Sub-coordinator routing

- **Architect** — already complete (architecture brief is the source of truth). No new architecture work in Phase 0 unless a task escalates a design gap.
- **UX Designer** — already complete (UX brief covers onboarding + empty Home). No new UX work; visual polish deferred to a later phase.
- **Code Developer** — primary executor for every task T0.1–T0.16. All scaffold, migrations, RLS, auth, layouts, and onboarding code lands here.
- **QA / Testing** — owns T0.9 (RLS smoke tests), reviews migrations in T0.7–T0.8, and executes the acceptance run in T0.16. RLS failures return to Code Developer with the failing SQL test as evidence and do not escape the Build layer.
- **Truth Agent** — final sign-off only. Verifies the exit-criteria checklist against observable evidence (DB rows, RLS test output, browser screenshots) before Build Coordinator hands the artifact back to the Central Orchestrator.

---

## Task list

### T0.1 — Repo init + monorepo layout decision
**Goal:** Initialize git and stand up an `app/` subdirectory inside the existing `dream_team/` prompt library, keeping prompts and product code in one repo without colliding.
**Files expected:** `.git/` (new), `.gitignore` (new at repo root), `app/` (new empty dir), `README.md` (append a "Repository layout" section noting `agents/` is the prompt library and `app/` is the v1 product).
**Success criteria:** `git status` runs cleanly at repo root; `app/` exists and is empty; root `.gitignore` excludes `node_modules`, `.env.local`, `.next`, `.vercel`, `supabase/.branches`, `supabase/.temp`.
**Validation command:** `git rev-parse --is-inside-work-tree` returns `true`; `ls app/` succeeds.
**Handoff:** Unblocks T0.2.

### T0.2 — Next.js 15 App Router scaffold
**Goal:** Create the Next.js 15 application inside `app/` with App Router, TypeScript, and Tailwind defaults.
**Files expected:** `app/package.json`, `app/tsconfig.json`, `app/next.config.ts`, `app/app/layout.tsx`, `app/app/page.tsx`, `app/app/globals.css`, `app/postcss.config.mjs`, `app/tailwind.config.ts`, `app/public/`.
**Success criteria:** `pnpm dev` from `app/` serves the default page at `http://localhost:3000`; App Router is active (no `pages/` directory created).
**Validation command:** `cd app && pnpm dev` then `curl -sI http://localhost:3000` returns `HTTP/1.1 200`.
**Handoff:** Unblocks T0.3.

### T0.3 — Tooling baseline
**Goal:** Lock TypeScript to strict, configure ESLint + Prettier, commit a `pnpm-lock.yaml`, and centralize env-variable typing.
**Files expected:** `app/tsconfig.json` (strict: true, noUncheckedIndexedAccess: true), `app/.eslintrc.json` (or `eslint.config.mjs`), `app/.prettierrc`, `app/pnpm-lock.yaml`, `app/src/env.ts` (Zod-validated process.env loader), `app/.env.example`.
**Success criteria:** `pnpm typecheck` and `pnpm lint` both exit 0 on a clean scaffold; missing required env vars in `src/env.ts` produce a clear startup error.
**Validation command:** `cd app && pnpm typecheck && pnpm lint`.
**Handoff:** Unblocks T0.4.

### T0.4 — Supabase CLI init + local stack
**Goal:** Initialize the Supabase project structure for migrations, RLS tests, and a local stack runnable via Docker.
**Files expected:** `app/supabase/config.toml`, `app/supabase/migrations/` (empty), `app/supabase/tests/` (empty), `app/supabase/seed.sql` (empty placeholder).
**Success criteria:** `supabase start` from `app/` brings up Postgres, Studio, Auth, and Storage containers; `supabase status` lists healthy services.
**Validation command:** `cd app && supabase start && supabase status` shows all services running; `psql "$(supabase status -o env | grep DB_URL)" -c "select 1"` returns 1.
**Handoff:** Unblocks T0.5 and T0.7.

### T0.5 — Supabase cloud project (dev) + env wiring
**Goal:** Create a single cloud Supabase project for shared dev (naming: `dream-team-dev`), and wire `.env.local` so the Next.js app can choose local vs. cloud via env file selection. Production project deferred until Phase 4 launch prep.
**Files expected:** `app/.env.example` (cloud + local var names), `app/.env.local` (gitignored, populated by developer), `app/src/lib/supabase/client.ts` (browser), `app/src/lib/supabase/server.ts` (server), `app/src/lib/supabase/middleware.ts` (cookie refresh helper).
**Success criteria:** A page that calls `supabase.auth.getSession()` server-side returns `null` for an unauthenticated request against both local and cloud projects depending on `.env.local` contents.
**Validation command:** With `.env.local` pointing at cloud: `curl -s http://localhost:3000/api/healthz` returns `{ "supabase": "ok" }` from a tiny health route added under `app/app/api/healthz/route.ts`.
**Handoff:** Unblocks T0.6, T0.10.

### T0.6 — Auth provider config (magic link + Google OAuth)
**Goal:** Enable Supabase Auth email magic link and Google OAuth on the dev project, register redirect URIs for `http://localhost:3000/auth/callback` and the eventual Vercel preview pattern.
**Files expected:** `app/supabase/config.toml` (local `[auth]` block with site_url + additional_redirect_urls), `app/docs/auth-setup.md` (a short runbook listing the Google Cloud OAuth client ID setup steps and Supabase dashboard toggles).
**Success criteria:** From the Supabase dashboard, "Email" provider is on (magic link enabled, signups allowed), "Google" provider is on with client_id/secret populated, redirect URIs include localhost and `https://*.vercel.app/auth/callback` placeholder.
**Validation command:** Manual (labeled): in the Supabase dashboard, both providers show as "Enabled"; `supabase config push` (if used) succeeds.
**Handoff:** Unblocks T0.10.

### T0.7 — Migration 0001: foundational tables
**Goal:** Create the four Phase 0 tables with the exact columns specified in the architecture brief §2, plus a `workspace_invites` table (token hash, expiry, role, email, single-use, accepted_at).
**Files expected:** `app/supabase/migrations/0001_phase0_foundation.sql` containing `users_profile`, `workspaces`, `workspace_members`, `workspace_invites` with PKs, FKs, indexes, and `check` constraints from the brief.
**Success criteria:** `supabase db reset` applies the migration cleanly; `\dt` in psql shows all four tables; no other tables created.
**Validation command:** `cd app && supabase db reset && psql "$(supabase status -o env | grep DB_URL)" -c "\dt public.*"` lists exactly the four tables.
**Handoff:** Unblocks T0.8.

### T0.8 — RLS policies for foundational tables
**Goal:** Enable RLS on all four tables and add the policies from the brief: workspace_members-gated reads, owner-only updates on `workspaces`, self read/write on `users_profile`, invite-acceptance-RPC-only writes on `workspace_members`, and unauthenticated lookup of an invite by token hash on `workspace_invites`.
**Files expected:** `app/supabase/migrations/0002_phase0_rls.sql` with `alter table … enable row level security` and `create policy …` statements; an `accept_invite(token text)` security-definer RPC inside the same migration.
**Success criteria:** RLS is enabled on all four tables (`pg_class.relrowsecurity = true`); the policies are listed in `pg_policies`; the `accept_invite` function exists and is `security definer` with a controlled search_path.
**Validation command:** `psql … -c "select tablename, rowsecurity from pg_tables where schemaname='public'"` shows `true` for all four; `psql … -c "select proname from pg_proc where proname='accept_invite'"` returns one row.
**Handoff:** Unblocks T0.9.

### T0.9 — RLS smoke tests
**Goal:** Per the architecture brief Risk #3, every table gets a paired SQL test asserting that a foreign workspace cannot read or write its rows.
**Files expected:** `app/supabase/tests/rls/users_profile.test.sql`, `app/supabase/tests/rls/workspaces.test.sql`, `app/supabase/tests/rls/workspace_members.test.sql`, `app/supabase/tests/rls/workspace_invites.test.sql`. Each uses `pgtap` (`plan`, `is`, `throws_ok`) and exercises: (a) member can read own workspace rows, (b) non-member cannot read, (c) non-owner cannot update workspaces, (d) direct insert into workspace_members fails, (e) accept_invite RPC succeeds with a valid token.

Example skeleton:

```sql
begin;
select plan(5);
select tests.create_supabase_user('a@x.test');
select tests.create_supabase_user('b@x.test');
-- ... insert workspace as user A, switch to user B
select throws_ok(
  $$ select * from workspaces where id = :a_ws $$,
  'permission denied or empty result expected'
);
select * from finish();
rollback;
```

**Success criteria:** `supabase test db` runs all four files and reports `ok` for every assertion.
**Validation command:** `cd app && supabase test db`.
**Handoff:** Unblocks T0.10. QA Testing sign-off on this task is mandatory before moving on; failures return to Code Developer.

### T0.10 — Next.js auth pages + Supabase SSR helpers
**Goal:** Implement `/signin`, `/signup`, and `/auth/callback` using `@supabase/ssr` with cookie-based sessions, and middleware that refreshes the session on every request.
**Files expected:** `app/app/(auth)/signin/page.tsx`, `app/app/(auth)/signup/page.tsx`, `app/app/auth/callback/route.ts`, `app/middleware.ts`, `app/src/lib/supabase/server.ts` (already from T0.5, extended), `app/src/components/auth/MagicLinkForm.tsx`, `app/src/components/auth/GoogleButton.tsx`.
**Success criteria:** Submitting a valid email on `/signin` sends a magic link (verifiable in local Inbucket at `http://localhost:54324`); clicking the link returns the user to `/auth/callback` and then to `/onboarding/1`; Google OAuth round-trip also lands at `/onboarding/1`.
**Validation command:** Manual (labeled): magic-link round-trip in local Inbucket; `curl -sI http://localhost:3000/signin` returns 200; `curl -sI http://localhost:3000/w/anything` redirects (3xx) when unauthenticated.
**Handoff:** Unblocks T0.11, T0.13.

### T0.11 — Onboarding routes `/onboarding/[step]`
**Goal:** Three static onboarding screens per UX brief §2 — workspace setup form, org primer (static SVG/diagram, skippable), starter-path picker (3 cards, all inert in Phase 0 except the workspace creation submit). On step 3 completion, set `users_profile.onboarded_at = now()`.
**Files expected:** `app/app/(onboarding)/onboarding/[step]/page.tsx`, `app/app/(onboarding)/onboarding/layout.tsx`, `app/src/components/onboarding/StepIndicator.tsx`, `app/src/components/onboarding/WorkspaceSetupForm.tsx`, `app/src/components/onboarding/OrgPrimer.tsx`, `app/src/components/onboarding/StarterPathCards.tsx`, `app/src/app/actions/onboarding.ts` (server actions).
**Success criteria:** A freshly signed-up user lands on `/onboarding/1`, fills workspace name + role, advances through steps 2 and 3, and lands on `/w/[slug]` with `users_profile.onboarded_at` populated and a row in `workspaces` + `workspace_members` (role=owner).
**Validation command:** Manual (labeled): complete the flow; then `psql … -c "select onboarded_at from users_profile where id = '<uuid>'"` returns a non-null timestamp.
**Handoff:** Unblocks T0.12 (workspace already exists by this step's end), T0.14.

### T0.12 — Workspace creation + workspace switcher
**Goal:** Provide a server action to create additional workspaces, a switcher component in the protected layout that lists the user's workspaces, and route changes to `/w/[newSlug]` on selection.
**Files expected:** `app/src/app/actions/workspaces.ts` (createWorkspace, switchWorkspace), `app/src/components/workspace/WorkspaceSwitcher.tsx`, `app/src/lib/slug.ts` (slugify + uniqueness check).
**Success criteria:** A user with two workspaces can switch between them via the header dropdown; URL updates to the new slug; slug collisions produce a clear inline error.
**Validation command:** Manual (labeled): create a second workspace from the switcher, switch, verify URL.
**Handoff:** Unblocks T0.13, T0.14.

### T0.13 — Protected layout for `/w/[slug]/*`
**Goal:** A layout that enforces (a) authenticated session, (b) membership in the workspace identified by the slug. Non-members get a 404 (not a 403, to avoid existence leaks). Implemented in middleware + a layout-level server check (defense in depth).
**Files expected:** `app/app/w/[slug]/layout.tsx`, `app/middleware.ts` (extended), `app/src/lib/auth/requireWorkspaceMember.ts`.
**Success criteria:** Visiting `/w/<other-users-workspace>` as a non-member returns 404; the same URL as a member renders the layout shell.
**Validation command:** Two-user manual test: log in as user A, copy their workspace slug, log out, log in as user B, attempt to visit the URL — expect 404.
**Handoff:** Unblocks T0.14, T0.15.

### T0.14 — Empty Home screen shell at `/w/[slug]`
**Goal:** Render UX brief §3 statically — hero band with two inert CTA buttons ("Generate work" and "Upload a brief"), collapsed org snapshot with the 5 layer chips (showing static specialist counts from `agents/`), 3 starter prompt cards (inert), and a quiet secondary row with "Browse all 28 agents" + "Read the contracts" (both inert anchors). No ticket logic, no data fetching beyond workspace name.
**Files expected:** `app/app/w/[slug]/page.tsx`, `app/src/components/home/HeroBand.tsx`, `app/src/components/home/OrgSnapshot.tsx`, `app/src/components/home/LayerChip.tsx`, `app/src/components/home/StarterPromptCard.tsx`, `app/src/data/agents.ts` (static layer→count map for now).
**Success criteria:** Page renders the workspace name in the hero, all 5 layer chips with correct counts (Build=5, Research=4, Operate=4, Distribution=4, Learning=4), 4 starter cards, no console errors. Buttons are present but `disabled` or click-no-ops with a tooltip "Coming in Phase 1".
**Validation command:** Manual (labeled): visit `/w/<slug>`, count chips and cards; `pnpm lint && pnpm typecheck`.
**Handoff:** Unblocks T0.15.

### T0.15 — Invite flow (single-use token, accept_invite RPC)
**Goal:** Owner/admin can invite a teammate by email + role; an email is sent containing a tokenized link `/invite/[token]`; clicking signs the user in (if needed) and calls `accept_invite(token)`.
**Files expected:** `app/app/w/[slug]/settings/members/page.tsx` (minimal — list members + invite form), `app/app/invite/[token]/page.tsx`, `app/src/app/actions/invites.ts` (createInvite, acceptInvite), `app/src/lib/email/sendInvite.ts` (uses Supabase Auth email or a no-op logger in local dev). The `accept_invite` RPC itself was created in T0.8.
**Success criteria:** Owner generates an invite, the invitee accepts, a `workspace_members` row exists for the invitee with the requested role, and the invite's `accepted_at` is set so re-use fails.
**Validation command:** Two-user manual test or scripted: `psql … -c "select count(*) from workspace_members where workspace_id = '<ws>'"` returns 2 after acceptance; second click on the same link shows "Invite already used".
**Handoff:** Unblocks T0.16.

### T0.16 — Phase 0 acceptance smoke
**Goal:** A single end-to-end run that proves the architecture brief's Phase 0 exit criteria, captured either as a Playwright spec or a documented manual script (decision: see Open Decisions #4).
**Files expected:** `app/tests/e2e/phase0.spec.ts` (if Playwright) or `app/docs/phase0-manual-acceptance.md` (if manual).
**Success criteria:** The script covers: (1) sign up via magic link, (2) complete 3-step onboarding, (3) land on empty Home with correct chip counts, (4) invite a teammate, (5) teammate accepts, (6) RLS smoke tests still pass. All steps pass without intervention.
**Validation command:** `cd app && pnpm test:e2e -- phase0` (if Playwright) or signed manual checklist (if manual). Plus a final `supabase test db` to confirm RLS suite is still green.
**Handoff:** Final sign-off. Build Coordinator routes to Truth Agent for honesty validation before packaging.

---

## Exit criteria

Checklist restated from architecture brief §8:

- [ ] A user can sign up via magic link or Google OAuth.
- [ ] A user can complete the 3-step onboarding and reach `/w/[slug]`.
- [ ] A user can create a workspace (auto-created during onboarding step 1).
- [ ] A user can invite a teammate by email + role; teammate can accept.
- [ ] The empty Home screen renders for both owner and invitee with no errors.
- [ ] `supabase test db` is green for all four RLS smoke test files.
- [ ] A non-member visiting `/w/<foreign-slug>` receives 404.
- [ ] `pnpm typecheck`, `pnpm lint`, and the acceptance script all pass.

Truth Agent verifies each box against an artifact (DB row, screenshot, command output) before sign-off.

---

## Risks specific to Phase 0

1. **Env drift between local and cloud Supabase** — site_url, redirect URIs, and provider toggles diverge silently. Mitigation: `app/docs/auth-setup.md` checklist run on both targets; `.env.example` is the canonical contract.
2. **RLS misconfig leaking cross-tenant data** — restated from architecture Risk #3. Mitigation: T0.9 is non-negotiable; QA blocks T0.10 until T0.9 is green.
3. **OAuth callback URI misregistration** — Google rejects the redirect if the URI doesn't exactly match. Mitigation: register both `http://localhost:3000/auth/callback` and the dev Supabase project's `*.supabase.co/auth/v1/callback` in Google Cloud, and verify in T0.6.
4. **Magic link deliverability in cloud dev** — Supabase's default email sender has aggressive rate limits and may land in spam. Mitigation: keep magic-link testing on local Inbucket (`http://localhost:54324`) and only smoke-test cloud magic link once at the end of T0.10.
5. **Slug collisions on workspace creation** — race condition if two users pick the same name. Mitigation: a unique constraint on `workspaces.slug` (already in T0.7) plus retry-with-suffix in `src/lib/slug.ts`.
6. **`accept_invite` RPC privilege escalation** — security-definer functions are the classic foot-gun. Mitigation: explicit `set search_path = ''`, no dynamic SQL, and an RLS smoke test that proves an arbitrary user cannot escalate to owner.

---

## Open decisions for the user

1. **Monorepo layout.** Confirm `app/` as the Next.js subdir inside the existing `dream_team/` repo, vs. a separate top-level repo. Recommendation: `app/` subdir (single source of truth for prompts + product).
2. **Package manager.** This plan assumes pnpm 9. Confirm or switch to npm/yarn/bun before T0.2.
3. **Hosting for dev.** Vercel preview deployments now, or local-only until Phase 2? Recommendation: local-only for Phase 0; spin up Vercel preview in Phase 1 when the first real flow exists to demo.
4. **Acceptance run format.** Playwright spec (more upfront cost, regression-safe) vs. documented manual script (faster for one-time Phase 0 sign-off). Recommendation: manual script for Phase 0, introduce Playwright in Phase 2 alongside the trace view.
5. **Supabase project naming.** Confirm `dream-team-dev` for the cloud dev project; production project name deferred to Phase 4.
6. **Email sender for invites.** Use Supabase's built-in transactional email for Phase 0, or wire Resend/Postmark now? Recommendation: built-in for Phase 0, swap to a dedicated provider in Phase 3 when Settings ships.

**Build Coordinator handoff:** On user sign-off of the six decisions above, Build Coordinator routes T0.1 to Code Developer and begins sequencing.
