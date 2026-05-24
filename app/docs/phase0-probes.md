# Phase 0 — auth + workspace probe matrix

Documented probes for T0.13 (protected-layout hardening) and the T0.16 acceptance smoke. Re-run after any change to `middleware.ts`, `src/app/page.tsx`, `src/app/onboarding/page.tsx`, or `src/app/w/[slug]/layout.tsx`.

## Prerequisites

- Local stack up: `pnpm exec supabase start`
- Migrations applied: `pnpm exec supabase db reset`
- Dev server on `http://localhost:3000`: `pnpm dev` (webpack — see AGENTS.md Phase 0 caveat)

## Seed users + workspaces

Run the seed in `scripts/seed-probe-users.sh` (or copy-paste these lines):

```bash
ANON=$(grep '^ANON_KEY' <(pnpm exec supabase status -o env) | cut -d'"' -f2)

# user A — will become onboarded with 2 workspaces
SA=$(curl -s -X POST http://127.0.0.1:54321/auth/v1/signup -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"probe-a@phase0.test","password":"probe-pass-1!"}')
TA=$(echo "$SA" | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
UA=$(echo "$SA" | python -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")
curl -s -X POST http://127.0.0.1:54321/rest/v1/rpc/create_workspace -H "apikey: $ANON" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"p_name":"A First","p_slug":"probe-a1"}'
curl -s -X POST http://127.0.0.1:54321/rest/v1/rpc/create_workspace -H "apikey: $ANON" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"p_name":"A Second","p_slug":"probe-a2"}'
WS_A1=$(docker exec supabase_db_app psql -U postgres -d postgres -t -A -c "select id from public.workspaces where slug='probe-a1'")
curl -s -X PATCH "http://127.0.0.1:54321/rest/v1/users_profile?id=eq.$UA" -H "apikey: $ANON" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "{\"default_workspace_id\":\"$WS_A1\",\"onboarded_at\":\"2026-05-24T00:00:00Z\"}"

# user B — onboarded, owns probe-b only (used to test foreign-slug 404 for A)
SB=$(curl -s -X POST http://127.0.0.1:54321/auth/v1/signup -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"probe-b@phase0.test","password":"probe-pass-1!"}')
TB=$(echo "$SB" | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -s -X POST http://127.0.0.1:54321/rest/v1/rpc/create_workspace -H "apikey: $ANON" -H "Authorization: Bearer $TB" -H 'Content-Type: application/json' -d '{"p_name":"B Solo","p_slug":"probe-b"}'

# user C — signed up, NOT onboarded, no workspaces
curl -s -X POST http://127.0.0.1:54321/auth/v1/signup -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"probe-c@phase0.test","password":"probe-pass-1!"}' >/dev/null
```

## Probe matrix

Each row is a single browser action. Validate via DevTools network panel or `curl -sI` for redirect cases. Cookie-bound flows must be exercised manually in a real browser (or with a Playwright spec when T0.16 lands automated).

| # | Actor | URL | Expected | Verified by |
|---|---|---|---|---|
| 1 | Unauthenticated | `GET /` | 307 → `/signin` | curl (no cookies) |
| 2 | Unauthenticated | `GET /w/probe-a1` | 307 → `/signin` (middleware) | curl |
| 3 | Unauthenticated | `GET /onboarding` | 307 → `/signin` | curl |
| 4 | Unauthenticated | `GET /signin` | 200 | curl |
| 5 | Unauthenticated | `GET /forgot-password` | 200 | curl |
| 6 | Unauthenticated | `GET /reset-password` | 200 | curl |
| 7 | Authenticated, no workspace, not onboarded (user C) | `GET /` | 307 → `/onboarding` | browser |
| 8 | Authenticated, no workspace, not onboarded (user C) | `GET /onboarding` | 200, OnboardingFlow renders | browser |
| 9 | Authenticated, no workspace (user C) | `GET /w/probe-a1` | 404 (notFound) — does not leak existence | browser |
| 10 | Authenticated, onboarded, default ws set (user A) | `GET /` | 307 → `/w/probe-a1` | browser |
| 11 | Authenticated, onboarded (user A) | `GET /onboarding` | 307 → `/w/probe-a1` (re-onboarding suppressed) | browser |
| 12 | Authenticated, onboarded (user A) | `GET /w/probe-a1` | 200, WorkspaceFrame renders, switcher shows A First + A Second | browser |
| 13 | Authenticated, onboarded (user A) | `GET /w/probe-a2` | 200, WorkspaceFrame renders, switcher highlights A Second | browser |
| 14 | Authenticated, onboarded (user A) | `GET /w/probe-b` (foreign) | 404 — RLS hides workspace; layout sees no row in `listMyWorkspaces()` → `notFound()` | browser |
| 15 | Authenticated, onboarded (user A) | `GET /signin` | 307 → `/onboarding` → 307 → `/w/probe-a1` (middleware + root redirect chain) | browser |
| 16 | Authenticated (user A) signs out from frame | post-action | 307 → `/signin`; session cookie cleared; subsequent `GET /w/probe-a1` → 307 → `/signin` | browser |

## Data-layer assertions (run anytime, no browser needed)

```bash
# RLS gate on workspaces list — A sees own only
ANON=...; TA=...
curl -s "http://127.0.0.1:54321/rest/v1/workspaces?select=slug" -H "apikey: $ANON" -H "Authorization: Bearer $TA"
# expect: [{"slug":"probe-a1"},{"slug":"probe-a2"}]

# RLS hides foreign workspace
curl -s "http://127.0.0.1:54321/rest/v1/workspaces?slug=eq.probe-b&select=slug" -H "apikey: $ANON" -H "Authorization: Bearer $TA"
# expect: []
```

## Definition of done

All 16 rows behave as expected, plus the data-layer assertions pass. Any row that returns the wrong code or leaks a foreign workspace is a regression and blocks T0.14.
