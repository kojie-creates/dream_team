# Supabase project isolation

Dream Team **must not** target the Orin Supabase project. Cross-tenant writes from the wrong project would corrupt Orin's ticket data and leak Dream Team rows into Orin's RLS scope.

## The banned project

| Project | Ref |
|---|---|
| Orin (forbidden) | `fwexgqktxdfiajpqlgvz` |

Any URL of the form `https://fwexgqktxdfiajpqlgvz.supabase.co` (or env vars referencing that ref) is banned in this app.

## Allowed targets (Phase 0)

| Target | URL pattern |
|---|---|
| Local stack | `http://127.0.0.1:54321` (default `pnpm exec supabase start`) |
| Dream Team cloud dev | A dedicated project named `dream-team-dev` (created later; ref decided then) |

Production project will be created in a later phase under its own ref.

## How the guard works

The script `scripts/verify-supabase-project.mjs` reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (decoded for the project ref claim) and exits non-zero if either references the banned ref. Run via:

```
pnpm verify:supabase-project
```

The script is intended to be called:

- before `pnpm dev` when switching environments
- in CI before deploy (Phase 1+)
- by anyone unsure about which project their `.env.local` points at

## What to do if it fails

1. Open `.env.local`.
2. Replace the URL and keys with the correct Dream Team project values (local stack or `dream-team-dev`).
3. Re-run `pnpm verify:supabase-project` to confirm.

If a teammate is asking you to point at the Orin ref "for a one-off check," stop and confirm in writing. The data planes are not interchangeable.
