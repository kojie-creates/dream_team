# Desktop Connectors — Roadmap & Definition of Done

**Status:** Active · **Owner:** Felix · **Created:** 2026-06-09
**Purpose:** The durable, bounded backlog for finishing the desktop app's integrations.
This is the authoritative list — when every item here is ✅, the desktop integration
work is **DONE**. No connector is in scope unless it is in this table or the schema
(`app/supabase/migrations/0006_phase5_connectors.sql`, `provider` check constraint).

## Definition of Done (the finish line)
The desktop app's integrations are **complete** when all **6 providers** in the schema
are connectable (OAuth), resolve a token from the vault, and ingest into the workspace
— plus the cross-cutting hardening (revoke + rotation) is in place. That is the end;
there is no connector beyond these six without an explicit scope change.

## Connector backlog (6 total — 1 done, 5 left)

| # | Connector | OAuth | Read ingest | Write | Status | Notes |
|---|-----------|-------|-------------|-------|--------|-------|
| 0 | google_calendar | ✅ | ✅ | ✅ (calendar holds) | **DONE** | Reference implementation. Live-verified. |
| 1 | gmail | reuse Google client | ⬜ messages/threads ingest | — | ⬜ TODO | +`gmail.readonly` scope only — **OAuth plumbing already done** (one Google client + fixed redirect). |
| 2 | google_drive | reuse Google client | ⬜ file metadata ingest | — | ⬜ TODO | +`drive.readonly` (or `drive.metadata.readonly`) scope. Reuse OAuth. |
| 3 | google_sheets | reuse Google client | ⬜ sheet/row ingest | — | ⬜ TODO | +`spreadsheets.readonly` scope. Reuse OAuth. |
| 4 | slack | **new OAuth provider** | ⬜ channel/message ingest | — | ⬜ TODO | Slack OAuth (own client + start/callback). Token vault reused. |
| 5 | notion | **new OAuth provider** | ⬜ page/database ingest | — | ⬜ TODO | Notion OAuth (own client + start/callback). Token vault reused. |

### Cross-cutting hardening (do once, applies to all connectors)
| # | Item | Status | Notes |
|---|------|--------|-------|
| H1 | HMAC-signed OAuth state | ✅ DONE | commit 7470f8d (Google; the helper generalizes). |
| H2 | Revoke-on-disconnect | ⬜ TODO | Call provider `oauth2/revoke` (Google) / token revoke (Slack/Notion) when a connector is removed. |
| H3 | Key rotation for connector_tokens | ⬜ TODO | `key_id` column + re-encrypt path for `CONNECTOR_TOKEN_ENCRYPTION_KEY` rotation. |

## What's already reusable (so each connector is small)
- **OAuth (Google trio):** one Google client + one fixed redirect URI
  (`/api/connectors/google/callback`) already handles calendar; gmail/drive/sheets are
  **+scopes only** — no new OAuth routes. (commit bb8ff6e)
- **Token vault:** `app/src/lib/connectors/tokenVault.ts` — generic AES-256-GCM, any provider.
- **Settings UI:** `ConnectorCard` + the catalog (`src/lib/connectors/catalog.ts`) already
  list all 6 — the UI is generic; a new connector lights up when its OAuth + ingest land.
- **Schema/RLS:** `connectors` + `connector_tokens` already support all 6 providers.

## Per-connector slice shape (repeatable recipe)
1. **OAuth:** Google trio → add scope to the start route's scope list. Slack/Notion →
   new start + callback routes (reuse `oauthState` signing + `tokenVault`).
2. **Token resolve:** a `resolveXToken(workspace)` like `googleCalendar.ts`.
3. **Read ingest:** a `lib/connectors/<provider>.ts` that pulls items → workspace ingest.
4. **(optional) Write tool:** only if a bounded write is needed (calendar has one; others read-only for now).
5. **Smoke:** operator connects in the app, ingest returns rows.

## Suggested order (highest leverage first)
**Gmail → Drive → Sheets** (Google OAuth done; each is +scope+ingest) → **Slack → Notion**
(new OAuth each) → **H2 revoke → H3 rotation**.

## Progress
- 2026-06-09: roadmap created. 1/6 connectors done (calendar). H1 done. 5 connectors + H2/H3 remain.
- 2026-06-09: operator connected **gmail, google_drive, google_sheets** (OAuth). Runtime
  tools added so the intern can use them: `gmail_send` (COMM), `drive_read` + `sheets_read`
  (CONr). Calendar has read+write. Gmail send needs the `gmail.send` scope on the connection.
  Remaining tool gaps: gmail READ ingest, drive/sheets WRITE; connectors slack + notion (own OAuth).
