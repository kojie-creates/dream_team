# Phase 5 T2 — Connector Settings Surface — Report

Date: 2026-05-24
Status: COMPLETE

## Summary

Added the workspace Settings → Connectors page. Six provider cards render in
the brief-mandated order, read connector metadata through the RLS-gated
session client, and surface honest status text (`Not connected`, or the exact
database status). No OAuth, no token exchange, no provider HTTP. Google
Calendar is marked as the first OAuth target with a disabled `Connect (Phase
5 T3)` button; every other provider shows a disabled `Later` button.

## Files Changed

Created:

- `app/src/app/w/[slug]/settings/connectors/page.tsx` — server component, RLS-gated.
- `app/src/components/connectors/ConnectorCard.tsx` — single card component.
- `app/src/lib/connectors/catalog.ts` — provider catalog (order, summary, planned scopes, phase).

Modified:

- `app/src/app/w/[slug]/settings/page.tsx` — replaced the disabled Connectors
  tile with a live `Link` to `/settings/connectors`.
- `app/scripts/copy-smoke.mjs` — added three Phase 5 T2 honest-copy checks
  (server-side-only token-boundary phrase; Phase 5 read-only phrase; exactly
  one catalog entry marked `planned-t3`).

No changes under `supabase/` — Phase 5 T1 schema was sufficient.

## Route Added

`GET /w/[slug]/settings/connectors` — App Router server component.

- Unauthenticated → `redirect('/signin')` (same guard as
  `settings/page.tsx` and `settings/members/page.tsx`).
- Slug not visible to the caller → `notFound()` (RLS filters the
  `workspaces` lookup).
- Linked from the Settings landing page in the existing "Areas" grid.

## Data Queried

All reads via `createSupabaseServerClient()` — anon key + user cookie session.

```sql
select id, slug, name from workspaces where slug = $1;
select id, provider, status, scopes,
       connected_at, last_sync_at, last_error
  from connectors where workspace_id = $workspace.id;
```

Rows are reduced to a `Map<ConnectorProvider, ConnectorRow>` and joined to the
static catalog at render time. When no row exists for a provider, the card
shows `Not connected`. No service-role client is ever instantiated on this
route; `connector_tokens` is never queried.

## Provider Cards and Action States

Render order matches the brief:

| # | Provider | Phase tag | Action button | Disabled |
|---|----------|-----------|---------------|----------|
| 1 | Google Calendar | `planned-t3` (First target) | `Connect (Phase 5 T3)` | yes |
| 2 | Google Drive | `planned-later` | `Later` | yes |
| 3 | Gmail | `planned-later` | `Later` | yes |
| 4 | Google Sheets | `planned-later` | `Later` | yes |
| 5 | Slack | `planned-later` | `Later` | yes |
| 6 | Notion | `planned-later` | `Later` | yes |

Each card shows:

- Provider name + "First target" badge for Google Calendar.
- One-line summary of intended use.
- Planned scopes list (plain language, read-only phrasing).
- Status badge: `Not connected` when no row, else exact DB status mapped
  through `CONNECTOR_STATUS_LABELS` (`disconnected`, `connecting`,
  `connected`, `error`, `revoked`).
- Granted scopes, `connected_at`, `last_sync_at`, and `last_error` rendered
  only when the database row provides them.
- Action note explaining why the button is disabled.

Buttons are real `<button disabled aria-disabled>` elements; no `href` exists
to a provider OAuth endpoint anywhere in the diff.

## Security Copy

Page renders a dedicated boundary callout:

- "Tokens are stored server-side only. Browser clients can see connector
  status, not token material."
- "Phase 5 starts read-only. No automated sending, posting, or writing
  happens through these connectors yet."
- "Connecting a provider takes you through that provider's consent screen.
  You can revoke access at any time from the provider account settings."

Footer reaffirms: "RLS-gated session reads only — no service-role bypass.
Token vault (`connector_tokens`) is unreadable by browser clients regardless
of role."

The first two phrases are enforced by new `copy-smoke` checks so removing
them in a future edit fails CI.

## Validation Output

```
pnpm copy:smoke           → copy-smoke: OK (28 checks)
pnpm model:smoke          → model-smoke: OK (13 checks)
pnpm verify:supabase-project → verify-supabase-project: OK
pnpm typecheck            → exit 0, no errors
pnpm lint                 → exit 0, no errors
pnpm exec supabase test db → Files=8, Tests=73, Result: PASS
```

The pgtap suite is unchanged from T1 (no schema change in T2). Test count
holds at 73.

## Operator Acceptance Notes

- `/w/<slug>/settings` shows the Connectors tile as a live link (no longer
  greyed out).
- Clicking it opens `/w/<slug>/settings/connectors` and renders six provider
  cards in the order: Google Calendar, Google Drive, Gmail, Google Sheets,
  Slack, Notion.
- Google Calendar is the only card showing the "First target" badge; its
  action button reads `Connect (Phase 5 T3)` and is disabled.
- Every other action button reads `Later` and is disabled.
- The security boundary callout and the footer copy are present.
- With no rows in `public.connectors`, every card shows `Not connected`.
  Inserting a row as the service role flips that specific card to its
  database status without affecting siblings.
- Unauthenticated visit to `/w/probe/settings/connectors` is guarded by the
  same `redirect('/signin')` pattern used elsewhere; no live HTTP probe was
  run in this session, but the code path is identical to `settings/page.tsx`
  and `settings/members/page.tsx`, both already exercised by operator smoke.

## Caveats and Non-Claims

- No OAuth routes, callbacks, state cookies, or token endpoints exist in
  this ticket.
- No provider HTTP client is configured. `ANTHROPIC_API_KEY` is the only
  external credential the env schema asks for; no Google / Slack / Notion
  env vars were added.
- "First target" copy describes intent only. The Google Calendar button
  cannot actually start a flow yet.
- Cards do not poll or auto-refresh. A status change in the database
  requires a page reload to appear, which is fine because no writes happen
  from the browser.

## Next Recommended Ticket

Phase 5 T3 — Google Calendar OAuth Skeleton. Wire the `Connect (Phase 5 T3)`
button to a server-side OAuth start route, add the callback handler, persist
the resulting tokens through service-role code into the locked-down
`connector_tokens` row, and flip the matching `connectors.status` to
`connected`. Encryption for the `*_encrypted` columns should land alongside
or before that ticket so real token material is never stored at rest in
plaintext.
