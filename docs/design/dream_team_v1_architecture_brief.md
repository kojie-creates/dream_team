# ARCHITECTURE BRIEF
**From:** Architect
**System:** Dream Team v1 — Multi-tenant SaaS Dashboard
**Date:** 2026-05-23
**Designed against:** `docs/design/dream_team_first_run_ux_brief.md` (14 screens, 5 statuses, live trace, 28 agents)

---

## Stack + tradeoff

**Chosen stack:** Next.js 15 (App Router, React Server Components) on Vercel + Supabase (Postgres 15, Auth, Storage, Realtime, Edge Functions Deno) + Anthropic API (Claude Opus 4.7 for Orchestrator/Coordinator routing, Claude Haiku 4.5 for brief synthesis and cheap classifier passes).

**Rationale:** Supabase already hosts the ticket store (per project CLAUDE.md), so auth, RLS, Storage, Realtime, and Edge Functions collapse five vendors into one. Next.js App Router gives us RSC for the agent catalog (mostly static reads) and streaming for the trace view, while keeping a single TypeScript codebase end-to-end.

**Rejected alternative:** Hono on Cloudflare Workers + Neon Postgres + Clerk + R2 + Ably. Cheaper per-request at scale and lower cold-start latency, but it splits the data plane (Neon) from auth (Clerk) from realtime (Ably) from object storage (R2). For v1 the operational surface area is the binding constraint, not per-request cost — Supabase wins. Revisit at >1M agent_runs/month.

**One-tradeoff call-out:** Supabase Realtime is convenient but its per-channel fan-out is bounded (~200 concurrent subscribers/channel is the documented soft ceiling). We accept this for v1 (per-ticket channels are tiny) and flag it in §8 risks.

---

## 1. Route map

All workspace-scoped paths live under `/w/[workspaceSlug]/…`. Auth and onboarding are top-level.

| Route | Type | Guard | Notes |
|---|---|---|---|
| `/` | Public | none | Marketing redirect → `/signin` if unauth, → last workspace if auth |
| `/signin`, `/signup` | Public | unauth-only | Screen 1 |
| `/auth/callback` | Public | none | Supabase OAuth return |
| `/onboarding/[step]` | Auth | auth, !onboarded | Screen 2, steps 1–3 |
| `/w/[slug]` | Workspace | auth + member | Screens 3/4 (empty vs. populated) |
| `/w/[slug]/new/upload` | Workspace | member | Screen 5 |
| `/w/[slug]/new/generate` | Workspace | member | Screen 6 |
| `/w/[slug]/tickets/[ticketId]` | Workspace | member + ticket.workspace_id match | Screens 7/8 (tabs: trace / artifact) |
| `/w/[slug]/tickets/[ticketId]/inspector` | Workspace | member | Screen 14 (failure/loop) |
| `/w/[slug]/agents` | Workspace | member | Screen 9 |
| `/w/[slug]/agents/[agentId]` | Workspace | member | Screen 10 |
| `/w/[slug]/history` | Workspace | member | Screen 11 |
| `/w/[slug]/settings/*` | Workspace | admin for write | Screen 12 |
| `/w/[slug]/billing` | Workspace | owner | Screen 13 |

**API routes (Next.js Route Handlers + Supabase Edge Functions):**

| Endpoint | Method | Transport | Backed by |
|---|---|---|---|
| `/api/tickets` | POST/GET | HTTP | Postgres via PostgREST |
| `/api/tickets/:id` | GET/PATCH | HTTP | PostgREST |
| `/api/tickets/:id/trace` | GET | **SSE** | Edge Function bridging Realtime → SSE |
| `/api/briefs/upload` | POST (multipart) | HTTP | Storage signed URL + parse Edge Function |
| `/api/briefs/synthesize` | POST | HTTP (streaming JSON) | Edge Function → Anthropic Haiku |
| `/api/orchestrate/:ticketId` | POST | HTTP | Edge Function → Anthropic Opus |
| `/api/artifacts/:id` | GET | HTTP (302 → signed URL) | Storage |
| `/api/agents`, `/api/agents/:id` | GET | HTTP | Static JSON cached at edge |
| `/api/connectors/oauth/:provider/callback` | GET | HTTP | Edge Function |

**Why SSE not WS:** trace stream is server→client only, survives proxies, and Edge Functions support it natively. WS reserved for v2 if we add collaborative cursors.

---

## 2. Supabase schema + RLS boundaries

All workspace-scoped tables carry `workspace_id uuid not null` + index. Default RLS: deny-all, then allow by workspace membership.

**`workspaces`** — `id uuid pk`, `slug citext unique`, `name`, `created_by uuid`, `plan text default 'free'`, `created_at`. RLS: select if member; insert by authenticated; update by owner.

**`workspace_members`** — `workspace_id`, `user_id`, `role text check in ('owner','admin','member')`, `invited_by`, `joined_at`. PK `(workspace_id,user_id)`. Index on `user_id`. RLS: select own rows + same-workspace members; insert via invite RPC only.

**`users_profile`** — `id uuid pk references auth.users`, `display_name`, `avatar_url`, `default_workspace_id`, `onboarded_at`. RLS: self read/write.

**`briefs`** — `id`, `workspace_id`, `source text check in ('paste','file','generate','connector')`, `storage_path`, `raw_text`, `word_count`, `parsed_status text`, `created_by`, `created_at`. Index `(workspace_id, created_at desc)`.

**`tickets`** — `id`, `wq_id text` (legacy id, indexed), `workspace_id`, `brief_id fk`, `title`, `status text check in ('open','in_progress','done','failed','looped','needs_input')`, `layer text`, `current_agent text`, `failure_type text null`, `loop_signature text null`, `created_by`, `created_at`, `updated_at`. Indexes on `(workspace_id, status, updated_at desc)` and `(workspace_id, current_agent)`.

**`agent_runs`** — `id`, `workspace_id`, `ticket_id fk`, `agent_id text`, `layer text`, `model text`, `input_tokens int`, `output_tokens int`, `cost_usd numeric(10,4)`, `started_at`, `ended_at`, `status text`. Index `(ticket_id, started_at)`.

**`trace_events`** — `id bigserial`, `workspace_id`, `ticket_id`, `seq bigint not null`, `from_agent`, `to_agent`, `event_type`, `payload jsonb`, `created_at`. Unique `(ticket_id, seq)`. Index `(ticket_id, seq)`. **Append-only** (no update/delete RLS).

**`packets`** — `id`, `workspace_id`, `ticket_id`, `trace_event_id fk`, `packet_type text check in ('handoff','failure','trace')`, `body_raw text`, `body_parsed jsonb`, `created_at`. Index `(ticket_id, packet_type)`.

**`artifacts`** — `id`, `workspace_id`, `ticket_id`, `kind text` (markdown/file/bundle), `storage_path`, `mime_type`, `bytes`, `created_at`. RLS workspace-scoped; download via signed URL only.

**`connectors`** — `id`, `workspace_id`, `provider text` (gmail/calendar/sheets/drive/notion), `status text`, `scopes text[]`, `connected_by`, `connected_at`.

**`connector_tokens`** — `connector_id pk fk`, `access_token_enc bytea`, `refresh_token_enc bytea`, `expires_at`. **No direct RLS read** — accessed only by service-role Edge Functions. Pgsodium for encryption at rest.

**Global RLS pattern:**

```sql
create policy "workspace_member_read" on tickets
for select using (
  workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  )
);
```

Writes are gated similarly with role checks for admin/owner-only tables.

---

## 3. Auth + multi-tenancy model

**Provider:** Supabase Auth — email magic link + Google/GitHub OAuth.

**Tenant boundary:** `workspaces.id`. Every domain row carries `workspace_id`. There is no cross-workspace read path in v1.

**Membership:** `workspace_members` with roles `owner` (1+ per workspace, billing + delete), `admin` (members + settings), `member` (work only). A user may belong to N workspaces.

**JWT custom claims:** A Postgres `auth.jwt_hook` injects `active_workspace_id` and `role` into the access token. The client sets active workspace by calling an RPC that updates `users_profile.default_workspace_id` and forces a token refresh. RLS policies can use either `auth.uid()` membership lookup (safe) or `auth.jwt() ->> 'active_workspace_id'` (faster) — we use the membership lookup as the source of truth and treat the JWT claim as a hint for the UI.

**Workspace switching:** Client-side workspace switcher hits `/api/workspace/switch`, server updates profile + returns refreshed session; route changes to `/w/[newSlug]`.

**Invite flow (sketch):** Owner/admin generates a single-use invite token (`workspace_invites` table, hashed token, expiry, role). Invitee follows link → signs in/up → RPC `accept_invite(token)` inserts membership row inside a transaction.

---

## 4. Brief upload / storage strategy

**Input paths v1:** paste textarea, file upload (.md/.txt/.pdf), Generate composer. Drive/Notion deferred to §7.

**Storage:** Supabase Storage bucket `briefs-{workspace_id}` (one bucket per workspace prefix, RLS via bucket policies). Max object 50KB enforced both client-side (pre-flight) and via a Postgres trigger on `briefs.word_count`/byte-size.

**Pipeline:**

1. Client requests signed upload URL from `/api/briefs/upload` (returns Storage signed URL + pre-allocated `briefs.id`).
2. Client PUTs file directly to Storage.
3. Storage webhook → Edge Function `parse-brief`:
   - `.md` / `.txt`: read directly, store in `briefs.raw_text`.
   - `.pdf`: extract via `pdf-parse` (Deno-compatible) running in Edge Function. Failures set `parsed_status='failed'` and surface as inline error.
4. On parse success, the same Edge Function inserts a `tickets` row with `status='open'` and enqueues Orchestrator classification.

**Paste path:** skips Storage; writes `raw_text` directly. Still creates a `briefs` row for uniform downstream.

---

## 5. Chat-to-brief generation flow

The Generate path is a short conversational pre-step that converts a free-form goal into a structured brief before Orchestrator routing.

**Flow:**

1. **Composer** (`/w/[slug]/new/generate`) — single prompt + optional collapsed fields (goal/constraints/success/deadline).
2. **Synthesizer call** — `POST /api/briefs/synthesize` (Edge Function) → Anthropic **Haiku 4.5** with a fixed system prompt that emits the canonical brief structure as JSON. Streamed back to the client as `text/event-stream` for live preview.
3. **Preview pane** — user sees structured brief, can edit any field inline. The "Strengthen this prompt" hint from UX §4b is fed by the same Haiku call returning a `weak_spots[]` array.
4. **Confirm** — `POST /api/briefs` writes the `briefs` row (source=`generate`), then `POST /api/tickets` opens the ticket and triggers Orchestrator.
5. **Orchestrator routing** — separate Edge Function calls **Opus 4.7** with the brief + the Central Orchestrator system prompt. Result writes the first `trace_event` + `packet`.

**Server-side, not client-side.** The Anthropic key never reaches the browser. Edge Function uses workspace-scoped rate limits (per `workspace_id` token bucket in `kv` or a Postgres `rate_limits` table).

**Model tiers:**
- Haiku 4.5 — synthesizer, weak-spot detector, cheap classifiers.
- Opus 4.7 — Orchestrator, Coordinators, Truth Agent.
- Sonnet 4.7 — Specialists (configurable per agent in `agent_config`).

---

## 6. Workflow / ticket / truth-review data flow

**Lifecycle state machine:**

```
open → in_progress → done
              ├─→ failed       (any FAILURE PACKET)
              ├─→ looped       (loop-termination contract trip)
              └─→ needs_input  (Orchestrator clarifying question)
needs_input → in_progress (on user reply)
failed/looped → open (on retry from inspector)
```

`needs_input` is the 5th status answering UX §8 open question #2. It surfaces inline in the trace view as a pending node with a reply composer; submitting writes a new `trace_event` and flips back to `in_progress`.

**Per-step persistence:**

| Step | Writes |
|---|---|
| Brief created | `briefs` |
| Ticket opened | `tickets (status=open)` |
| Orchestrator classifies | `trace_events`, `packets (handoff)`, `agent_runs` |
| Coordinator routes | `trace_events`, `packets (handoff)`, `agent_runs` |
| Specialist runs | `agent_runs`, optionally `artifacts` |
| QA result | `trace_events`, `packets` |
| Truth Agent verdict | `trace_events`, `packets`, `tickets.status=done` |
| Failure | `packets (failure)`, `tickets.status=failed`, `tickets.failure_type` |
| Loop trip | `tickets.status=looped`, `tickets.loop_signature` |

**Real-time fan-out:** One Supabase Realtime channel per ticket: `ticket:{ticket_id}`. Subscribers receive `trace_events` INSERTs and `tickets` UPDATEs. SSE bridge endpoint exists for clients that prefer it. Channel subscription is RLS-gated by workspace membership.

**Orchestration runner:** A single Edge Function `run-orchestration` is invoked per agent step, with `pg_cron` polling for `tickets` in `in_progress` that need a next step. Each step is idempotent (keyed by `(ticket_id, seq)`).

---

## 7. Connector architecture for future Gmail / Calendar / Sheets

Out of scope for v1 build, designed as a seam now so we do not retrofit.

**Registry table:** `connectors` (provider, scopes, status). **Token vault:** `connector_tokens` with `pgsodium`-encrypted access/refresh tokens. Only service-role Edge Functions decrypt.

**OAuth callback:** `/api/connectors/oauth/:provider/callback` Edge Function exchanges code → tokens, encrypts, writes to `connector_tokens`, flips connector status to `connected`.

**Uniform adapter interface (Deno modules in `supabase/functions/_connectors/`):**

```ts
interface ConnectorAdapter {
  fetch(workspaceId: string, query: FetchQuery): Promise<Resource[]>;
  write(workspaceId: string, payload: WritePayload): Promise<WriteResult>;
  list(workspaceId: string, kind: string): Promise<Resource[]>;
}
```

Each provider (`gmail.ts`, `calendar.ts`, `sheets.ts`, `drive.ts`, `notion.ts`) implements this. Agents request connector actions via a single `connector.invoke` tool call routed through the adapter registry. Scopes are recorded per connector for least-privilege display in Settings.

---

## 8. Build phases + risks

| Phase | Scope | Exit criteria |
|---|---|---|
| **0** | Supabase project, auth, workspaces, members, RLS smoke tests, Next.js shell with empty Home. | A user can sign up, create a workspace, invite a teammate, see empty Home. RLS verified by `supabase test`. |
| **1** | Briefs (paste only), tickets, single Orchestrator round-trip writing trace_events + packets. No live stream — refresh-to-update. | Submit a pasted brief, see Orchestrator classification land in DB, ticket reaches `done` via stubbed downstream. |
| **2** | Full trace view with SSE/Realtime, Coordinator + Specialist + QA + Truth Agent end-to-end. Artifact storage + viewer. File + PDF upload. | A real brief produces a real artifact, live-streamed, multi-tenant isolated. |
| **3** | Agent Catalog (Screen 9), Agent Detail (Screen 10), History (Screen 11), Settings (Screen 12). | All 28 agents browsable, contracts viewable, member management functional. |
| **4** | Failure / Loop Inspector (Screen 14), `needs_input` flow, retry actions, Billing meter (Screen 13). | Forced-failure brief shows correct inspector; loop simulation produces `looped` status with signature; usage meter accurate within 1%. |
| **5** | Connectors (Gmail/Calendar/Sheets first), Generate-path Drive/Notion ingest. | OAuth round-trip works for one provider; agent can read+write via adapter. |

**Risks:**

1. **Model cost runaway** — Opus on every Orchestrator + Coordinator + Truth step is expensive. Mitigation: per-workspace daily token budget in `rate_limits`, fall back to Sonnet on the second loop iteration, hard cap on `MAX_ORCHESTRATION_ITERATIONS=15` (already in loop-termination contract).
2. **Trace fan-out at scale** — Supabase Realtime per-channel ceiling (~200 subs) is fine per-ticket but the workspace-wide ticker (populated Home) needs a single workspace channel filtered server-side, not 1 channel per ticket card. Mitigation: workspace channel + client-side dispatch.
3. **RLS misconfig leaking cross-tenant** — Highest-severity risk. Mitigation: every table created via migration includes a paired `tests/rls/<table>.test.sql` that asserts a foreign workspace cannot read. CI blocks merge without it. Use `get_advisors` weekly.
4. **PDF parsing reliability** — Deno PDF libs are weaker than Node. Mitigation: v1 ships with size cap 50KB (most PDFs at that size are text-extractable); failures surface as inline error with "paste as text" fallback, never block submission.
5. **Agent prompt drift vs. contracts** — As agents evolve, packet formats can drift from the three canonical contracts. Mitigation: contract validator Edge Function runs on every `packets` insert and rejects malformed bodies; a per-agent prompt hash recorded in `agent_runs.prompt_hash` for forensic replay.
6. **Realtime → SSE bridge as a single point of failure** — If the bridge Edge Function dies, live trace stops. Mitigation: client falls back to 2s polling on `/api/tickets/:id/trace?since=:seq` if SSE disconnects twice; the polling endpoint hits the same Postgres query.

---

**Open questions deferred to Code Developer:**

1. Exact pg_cron polling cadence for `run-orchestration` (1s vs. 5s) — measure under load in Phase 2.
2. Whether to use `pgsodium` transparent column encryption or app-level Edge Function encryption for `connector_tokens` — pick during Phase 5.
3. Billing meter source of truth — `agent_runs.cost_usd` summed in a materialized view, refreshed every 5 min, vs. real-time. Default to materialized view unless Phase 4 testing shows >5 min lag is user-visible.

**Handoff ready for Build Coordinator → Code Developer.**
