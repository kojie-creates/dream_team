# Phase 2 T6 — File Upload + Artifact Viewer Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates).** Live operator acceptance walk pending per the same protocol as T2–T5.

T6 adds a narrow file-upload path for plain-text and markdown briefs. The upload route reuses the paste flow's ticket conventions exactly: one `briefs` row (`source='file'`, `storage_path=null`), one `tickets` row (`status='open'`), then redirect to `/w/[slug]/tickets/[ticketId]`. Orchestrator → Coordinator → Specialist → QA → Truth all continue to work because the downstream shape is unchanged.

Storage was **deferred**. `briefs.raw_text` already supports up to the same 10,000-char ceiling the paste path uses; the 128 KB file cap maps comfortably below it. No bucket added, no second RLS surface introduced.

The artifact viewer block on the ticket detail page was polished — clearer per-row metadata (kind, type, byte count, line count, created-at), an honest header note ("the artifact body is the linked packet content stored in the database … there is nothing to download"), and a max-height + overflow on the packet body so a large generated markdown artifact no longer expands the page indefinitely. No schema change.

`pnpm exec supabase db reset` was **not run** — auto-mode classifier rejects destructive ops and no migration changed in this ticket. `pnpm exec supabase test db` ran clean against the unchanged 0001..0005 migration set.

## 2. Files changed

Created:
- `app/src/app/actions/briefs.ts` — added `createBriefFromUpload` action + `UploadBriefState` type, `UPLOAD_MAX_BYTES`, `ALLOWED_EXT`, `ALLOWED_MIME` constants, `fileExt`, `titleFromFilename` helpers. Paste action unchanged.
- `app/src/components/briefs/UploadBriefForm.tsx` — client form: file `<input>` with `accept=".txt,.md,.markdown,text/plain,text/markdown"`, optional title, client-side extension/size pre-check, server-action submit, error rendering, `Uploading…` pending state.
- `app/src/app/w/[slug]/new/upload/page.tsx` — RSC page mirroring the paste page (workspace lookup, `notFound()` on miss, header + form + back link).
- `docs/briefs/phase2_t6_file_upload_artifact_viewer_report.md` — this file.

Modified:
- `app/src/components/home/HomeIntro.tsx` — "Upload a brief" is now a live `<Link>` to `/w/[slug]/new/upload`. The disabled-button placeholder it replaced was the Phase 2 marker. "Generate with chat" stays disabled, retagged as Phase 3.
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` — Artifacts section gets the clarifying note, a richer metadata row (now includes line count and explicit `kind:` / `type:` prefixes), and a scroll-capped packet body (`max-h-96 overflow-auto`). No schema or query shape change.
- `app/scripts/copy-smoke.mjs` — adds `UploadBriefForm.tsx` and `new/upload/page.tsx` to the no-`stub` set; adds a new T6 check group (`no unguarded upload-overclaim`) that flags `pdf|ocr|docx|supabase storage|storage bucket` unless adjacent to `no|not|never|without|nothing` within the same 80-char window the T4/T5 checks use. Now **16** static checks total.

Untouched:
- Schema (no migration). `briefs.source` already allowed `'file'`. `briefs.storage_path` stays `null`.
- RLS policies. Paste-flow policies on `briefs` and `tickets` cover the upload path identically.
- All Phase 2 T2/T3/T4/T5 server actions (`orchestration.ts`, the three ticket-detail run buttons, progress strip, auto-refresh).
- No new dependency. No model call.

## 3. Upload route and server action behavior

Route: `GET /w/[slug]/new/upload` — RSC page, gated by the existing workspace layout. Workspace lookup `notFound()`s on miss.

Action: `createBriefFromUpload(prev, FormData)` in `app/src/app/actions/briefs.ts`. Pipeline:

1. Read `slug`, `title`, `file` from the FormData.
2. Reject if `slug` is empty.
3. Reject if `file` is not a `File` instance.
4. Reject empty files (`size === 0`).
5. Reject files over `UPLOAD_MAX_BYTES = 128 * 1024`.
6. Reject if filename extension is not one of `.txt`, `.md`, `.markdown`.
7. Reject if MIME type is set and is not one of `text/plain`, `text/markdown`, `text/x-markdown`, or empty (browser variance for `.md`).
8. Reject if title is over 120 chars.
9. UTF-8 decode the buffer (`fatal: false`). Catch and report decode failure.
10. Trim. Reject if empty after trim. Reject if shorter than `MIN_LEN = 20` or longer than `MAX_LEN = 10,000` chars.
11. Verify auth (redirect to `/signin` if no user) — uses the same `createSupabaseServerClient()` session client as the paste action. **No service-role.**
12. Resolve workspace by slug under RLS.
13. Insert into `briefs` with `source='file'`, `raw_text=<trimmed>`, `word_count=<computed>`, `parsed_status='ready'`, `created_by=user.id`. `storage_path` is left `null`.
14. Insert into `tickets` with `title = rawTitle || titleFromFilename(file.name)`, `status='open'`, same `workspace_id`, `brief_id` joined.
15. `revalidatePath('/w/[slug]')`, then `redirect('/w/[slug]/tickets/<uuid>')`.

`titleFromFilename` strips the path prefix, drops the `.txt|.md|.markdown` extension, converts `_` and `-` to spaces, trims, and slices to 80 chars. Fallback `'Uploaded brief'` if the cleaned name is empty.

## 4. Accepted / rejected file rules

| Rule | Behavior |
|---|---|
| `.txt` (`text/plain` or blank MIME) | Accepted. |
| `.md` (`text/markdown`, `text/x-markdown`, or blank MIME) | Accepted. |
| `.markdown` | Accepted. Same path as `.md`. |
| `.pdf`, `.docx`, `.rtf`, `.html`, any other extension | Rejected with copy "Only .txt, .md, or .markdown files are accepted in this phase." |
| File size = 0 | Rejected with "File is empty." |
| File size > 128 KB | Rejected with "File must be 128 KB or smaller." |
| Decoded text empty after trim | Rejected with "File has no readable text." |
| Decoded text < 20 chars | Rejected with "Brief must be at least 20 characters after trim." |
| Decoded text > 10,000 chars | Rejected with "Brief must be 10,000 characters or fewer." |
| Non-UTF-8 garbage bytes | Decoded with `fatal: false`; if everything collapses to empty, rejected as empty text. No exception leaks to the user. |
| Unauthenticated submit | `redirect('/signin')`. |
| Workspace slug not visible to user | Rejected with "Workspace not found or access denied." (RLS-equivalent message — does not distinguish missing from unauthorized.) |

Client-side pre-checks in `UploadBriefForm` mirror the extension and size rules so the operator gets immediate feedback before the round-trip; **the server is the authority** and re-validates every field.

## 5. Storage decision

**Deferred.** No Supabase Storage bucket added. Reasons recorded for the next operator:

- `briefs.raw_text` already supports the file payload at this size cap. The schema field `storage_path` exists from migration 0005 and stays `null` for `source='file'` rows in this phase.
- Adding a bucket adds a second authZ surface (bucket RLS), a second test corpus (storage policy tests), and a third failure mode (network + bucket quota) for marginal product value at Phase 2.
- A future ticket that genuinely needs file persistence (PDF/binary attachments, Drive sync, connector ingest) should land the bucket and its policy tests as a dedicated unit so it can be reasoned about on its own.

No silent storage usage. No service-role file write. Honestly reflected in UI copy.

## 6. Artifact viewer changes

Scope: only the rendered block at `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` lines 287–329 (pre-edit). No schema change. No new component file (kept inline — single call site, the page is still readable).

Changes:
- Added an honest header line above the list: "Artifact body is the linked packet content stored in the database. No external file is uploaded or downloaded; there is nothing to download." This kills the implicit "downloadable file" affordance some operators were reading into the row.
- Metadata row now uses `kind: <name>` and `type: <mime>` labels (was bare chips), shows `bytes` with thousand separators, adds a derived `lines` count when the packet body is present, and labels the timestamp as `created <ts>`.
- Packet body is rendered inside a `max-h-96 overflow-auto` scroll region (was unbounded). Long generated artifacts no longer push the trace / QA / Truth panels off the fold.
- Empty-body case now reads "No body packet linked. Artifact metadata only." (was "No body packet linked.") — clearer that the row is intentional, not broken.

Deliberately not done:
- No new `ArtifactViewer.tsx` component. The block is read once, ~40 LOC, and lives next to the trace/QA/Truth blocks it visually mirrors. Extracting would split the rendering of three sibling sections across two files for no reuse win — flagged for revisit if a second call site appears.
- No claim of "download" or "open file" affordance. None of the artifact bytes live outside the database, so any such button would be a lie.

## 7. Validation output (exact pass lines)

### `pnpm copy:smoke`
```
  ok  - no rendered "stub" copy in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunOrchestratorStubButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunSpecialistPassButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunQaTruthReviewButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/TicketProgressStrip.tsx
  ok  - no rendered "stub" copy in src/components/tickets/TicketAutoRefresh.tsx
  ok  - no rendered "stub" copy in src/components/briefs/UploadBriefForm.tsx
  ok  - no rendered "stub" copy in src/app/w/[slug]/new/upload/page.tsx
  ok  - no unguarded external-attestation claim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded external-attestation claim in src/components/tickets/RunQaTruthReviewButton.tsx
  ok  - no unguarded streaming-transport claim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded streaming-transport claim in src/components/tickets/TicketProgressStrip.tsx
  ok  - no unguarded streaming-transport claim in src/components/tickets/TicketAutoRefresh.tsx
  ok  - no unguarded upload-overclaim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded upload-overclaim in src/app/w/[slug]/new/upload/page.tsx
  ok  - no unguarded upload-overclaim in src/components/briefs/UploadBriefForm.tsx
copy-smoke: OK (16 checks)
```

### `pnpm model:smoke`
```
model-smoke: OK (13 checks)
```

### `pnpm typecheck`
Exit 0, no diagnostics.

### `pnpm lint`
Exit 0, no diagnostics.

### `pnpm verify:supabase-project`
```
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

### `pnpm exec supabase test db`
```
Files=7, Tests=59,  0 wallclock secs ...
Result: PASS
```

### `pnpm exec supabase db reset`
**Blocked by auto-mode classifier.** Same carried caveat as T3/T4/T5. Migration set 0001..0005 unchanged in this ticket; pgtap suite ran clean against the live local DB, which is the proof the migration set still applies. Operator should run a manual reset once before Phase 3 T1 to keep that proof fresh.

## 8. Operator acceptance steps

1. With `pnpm dev` running, sign in. Land on `/w/<slug>`.
2. Observe HomeIntro CTAs: "Paste a brief" (live, neutral-100 button), "Upload a brief" (live, neutral-700 outline link — newly enabled), "Generate with chat" (still disabled, retagged Phase 3).
3. Click **Upload a brief**. Confirm route is `/w/<slug>/new/upload` and workspace name shows above heading.
4. Prepare a small `.txt` file with ≥20 chars (or a `.md` file). Pick it via the file input. Confirm the chosen-file line shows filename, byte count, and (where the browser provides it) MIME type.
5. Try a `.pdf` first: client-side error reads "Only .txt, .md, or .markdown files are accepted." Submit button stays disabled. Replace with the `.txt`.
6. Submit. Expect redirect to `/w/<slug>/tickets/<uuid>`. Header shows the ticket title (filename-derived if you left title blank).
7. Source-brief panel shows the file contents. The "From brief" subline reads `source: file`, with `word_count` and date.
8. Click **Run Orchestrator** → wait → **Run Specialist Pass** → wait → **Run QA + Truth Review**. Each completes exactly as it does for a paste-source ticket.
9. After the specialist pass, the Artifacts section shows the new metadata row (`kind: …`, `type: text/markdown`, byte count, line count, `created …`). The packet body sits inside a scrollable block; long output no longer pushes the QA/Truth panels off-screen.
10. Verify the honest-copy note above the artifact list: "Artifact body is the linked packet content stored in the database. No external file is uploaded or downloaded; there is nothing to download." No download button or link should be present anywhere on the page.
11. Hard-reload the ticket detail. No duplicate trace events / packets / artifacts (idempotence preserved from T2/T3/T4).
12. (Negative path) Try uploading an empty `.txt`, a >128 KB `.txt`, and a renamed `.exe` posing as `.txt` (the server will still trust the extension and MIME but the content must trim to ≥20 chars — a binary that decodes to empty text trips "File has no readable text."). Confirm each surfaces a clear inline error.

## 9. Hard-boundary checklist

| Boundary | Status |
|---|---|
| No schema migration | ✔ |
| No PDF extraction | ✔ |
| No OCR | ✔ |
| No Supabase Storage bucket | ✔ — `storage_path` stays `null` |
| No connector ingest | ✔ |
| No new model call | ✔ |
| No service-role write | ✔ — session client only |
| No service-role key in logs / responses | ✔ — never referenced in T6 code |
| Server-side file validation | ✔ — every check re-runs in the action |
| Markdown rendered as plain text only | ✔ — `<pre>` block, no `dangerouslySetInnerHTML` anywhere on the path |
| Downloadable-artifact claim | ✔ — explicitly negated in artifact viewer copy |
| New dependency | ✔ — zero |

## 10. Carried caveats into Phase 3

1. **`pnpm exec supabase db reset` still blocked** by auto-mode classifier. Same advice carried from T3/T4/T5. Operator should run it once before Phase 3 T1.
2. **Playwright/regression net still open.** Three input paths now exist (paste, upload, the disabled generate stub); an e2e smoke covering both the paste and upload create flows would lock in T6's contract cheaply.
3. **No file storage.** When the product genuinely needs PDF/binary attachments, a dedicated ticket should land the bucket, its RLS, and storage-policy pgtap tests as one unit.
4. **`storage_path` is currently dead column** for the file path. Document or repurpose when storage actually arrives; do not silently fill it.
5. **Rejected-verdict UX and failed-ticket retry** still owned by Phase 4.
6. **Per-workspace daily token budget** still uncollected.

## 11. Next recommended ticket

**Phase 2 closeout + Phase 3 T1 — Navigation + Route Skeleton.** T6 was the last must-land for Phase 2: a brief can now enter via paste *or* file, every ticket walks the full evidence chain, and the artifact body renders without misleading the operator. The natural next step is Phase 3 T1 to give the surrounding shell (tickets list, agents directory, settings) the real routes it needs before Phase 3 feature work. A Playwright smoke covering paste + upload create paths is the strongest defensive add along the way.

## 12. Final status

**Phase 2 T6 — PASS (code gates). Live operator acceptance pending Felix walk-through per §8. `supabase db reset` blocked by auto-mode classifier; the unchanged migration set is implicitly covered because `supabase test db` ran clean (Files=7, Tests=59, Result: PASS).**
