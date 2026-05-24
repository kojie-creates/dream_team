# Dream Team — app/

Next.js 16 (App Router) + Supabase. Multi-tenant SaaS dashboard for the Dream Team agent runtime. Phase 0 in progress.

## Scope of this directory

Product code only. The prompt library (parent `agents/`, `contracts/`) is not consumed at build time. App reads agent metadata from a static map (`src/data/agents.ts`) until a real registry lands.

## Authoritative docs (read before editing)

- `../docs/design/dream_team_first_run_ux_brief.md` — UX spec
- `../docs/design/dream_team_v1_architecture_brief.md` — architecture, schema, RLS
- `../docs/design/dream_team_phase_0_implementation_plan.md` — current phase plan and task list

## Stack notes

- Next.js 16.2.6 with App Router and Turbopack dev. Route Handlers under `src/app/api/*`.
- React 19, RSC default. Use `'use client'` only when needed.
- Tailwind 4 (CSS-first via `@tailwindcss/postcss`). No `tailwind.config.ts`.
- TypeScript strict. Env loaded through `src/env.ts` (Zod).
- Supabase: `@supabase/ssr` for cookie sessions. Anon key client-side, service role server-only.
- Package manager: pnpm 9. Run scripts from `app/`.

## Out of scope here

No prompt-library edits, no contract edits, no orchestration runner. Those live in parent dirs and later phases.

## Next.js 16 caveat

This is not the Next.js in your training data. APIs and conventions differ from 14/15. Heed deprecation notices and check `node_modules/next/dist/docs/` when uncertain.

## Phase 0 caveats

- **Turbopack dev panics on Windows** when processing `globals.css` for new app routes (`0xc0000142` subprocess error). `pnpm dev` is pinned to `next dev --webpack` for now. `pnpm dev:turbo` keeps Turbopack as an opt-in. Revisit when Next 16.x patches the issue.
- **Workspace creation goes through `create_workspace` RPC** (migration 0003), not a direct REST insert. PostgREST 14.10's wrapped CTE INSERT triggers a spurious RLS WITH CHECK violation even when `auth.uid() = created_by`. The RPC is `SECURITY DEFINER` with `search_path = ''`, so RLS intent is preserved inside the function body.
