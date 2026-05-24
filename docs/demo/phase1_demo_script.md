# Phase 1 Demo Script — Dream Team

**Audience:** stakeholder unfamiliar with the codebase.
**Length:** ~10 minutes of presenter time.
**Setup before the call:** dev server running (`pnpm dev` from `app/`), browser pointed at `http://localhost:3000`, signed out, smoke user credentials at hand, a one-paragraph product brief (≥20 chars) on the clipboard. Pre-pick a workspace that already has at least one prior ticket so the Home panels are not empty for the opening shot.

**Honesty rule for the presenter:** the Orchestrator in this demo is a deterministic stub. It does not call a model and does not reason. Every "what to say" line below respects that. Do not improvise around it.

---

## 1. Sign in

- **What you click:** open `http://localhost:3000`, sign in as the smoke user.
- **What they see:** the workspace home at `/w/<slug>`. Top hero (`HomeIntro`), starter domain chips, then four summary cells (Open tickets / Done tickets / Total briefs / Latest run status), then three panels: Recent briefs, Tickets, Workflow runs.
- **What to say:** "This is a workspace home. Everything below the hero is read live from our database — those counts and panels are what other people on this workspace would see, gated by row-level security."

## 2. Read the Home snapshot

- **What you click:** nothing — point at the summary strip.
- **What they see:** four cells with current counts; "Latest run" reads `done` (or `—` for a fresh workspace).
- **What to say:** "We're about to add one brief and run the Orchestrator stub against it. Keep an eye on these four numbers — they should each move by one in about a minute."

## 3. Paste a brief

- **What you click:** the `Paste a brief` button in the hero.
- **What they see:** `/w/<slug>/new/paste`. A textarea, optional title field, submit button.
- **What to say:** "Phase 1 only supports paste. Upload and the Generate composer are designed but disabled — they land in Phase 2."

## 4. Submit the brief

- **What you click:** paste the prepared paragraph, leave the title blank, hit submit.
- **What they see:** redirect to `/w/<slug>/tickets/<uuid>`. Ticket detail page with status pill `Open`, a breadcrumb `<workspace> · Tickets · Ticket`, a `From brief · paste · N words · <date>` line, the pasted text below, an empty Trace section, and an `Orchestrator (Phase 1 stub)` panel with a Run button.
- **What to say:** "Submitting created two rows — one brief, one ticket — under the user's session, gated by row-level security. No service role yet. The ticket is open, with no agent assigned and no trace events."

## 5. Run the Orchestrator stub

- **What you click:** the `Run Orchestrator stub` button.
- **What they see:** the button briefly shows `Running stub…`, the page reloads. Status pill flips to `Done`, header now reads `Layer: build · Agent: central-orchestrator · Opened …`, the Run panel is gone, and the Trace section lists one event `#1 orchestrator_stub.classified` from `user → central-orchestrator` with a one-line summary, plus one nested `packet:handoff` row.
- **What to say:** "That click is a server action. It writes one workflow_run, one trace event, and one handoff packet under a service-role client — then it marks the ticket done. The classification you see is hard-coded; this is a deterministic stub, not a model call. We're proving the write contract and the audit trail before we pay an LLM."

## 6. Refresh — confirm idempotence

- **What you click:** browser refresh.
- **What they see:** identical page; still one trace event, one packet, no duplicates.
- **What to say:** "The server action guards against duplicate writes — re-running it on a non-open ticket does nothing. That guard is application-level today; we will harden it with a database constraint when the real Orchestrator lands."

## 7. Back to the ticket list

- **What you click:** the `← Back to tickets` link at the bottom of the detail page.
- **What they see:** `/w/<slug>/tickets`. A header, seven filter chips (`All`, `Open`, `In progress`, `Needs input`, `Done`, `Failed`, `Looped`) each with a count, then the ticket list with the new ticket at the top showing the `Done` pill.
- **What to say:** "Six statuses are wired in the database, including a `Needs input` state for when an agent has a clarifying question — that surface lights up in Phase 4 with the failure-and-loop inspector."

## 8. Filter by Done

- **What you click:** the `Done` chip.
- **What they see:** URL becomes `/w/<slug>/tickets?status=done`. List filters to only `Done` tickets; the new one is present.
- **What to say:** "Filters are URL-driven, so a deep link to a filtered view works."

## 9. Filter by Open

- **What you click:** the `Open` chip.
- **What they see:** the new ticket disappears from the list.
- **What to say:** "Confirms the status moved — the just-created ticket is no longer in the open bucket."

## 10. Back to home, watch the counts

- **What you click:** the `<workspace>` link in the breadcrumb.
- **What they see:** `/w/<slug>`. The four summary cells have each incremented by one (Open same / Done +1 / Total briefs +1 / Latest run `done`). The new brief appears in Recent briefs, the new ticket in Tickets, and a new row in Workflow runs reading `orchestrator · central-orchestrator · stub` with a `Done` pill.
- **What to say:** "Same Home as the opening shot — those four numbers moved as predicted, and the three panels each grew by one row from the same end-to-end flow you just watched."

## 11. Cross-link from the workflow run

- **What you click:** the new row in the Workflow runs panel.
- **What they see:** back on the ticket detail page for the ticket we just created.
- **What to say:** "Every workflow run links back to its ticket. Once Phase 2 wires the real Orchestrator and the coordinators behind it, you will see one of these rows per agent invocation, with token counts and cost — that surface is already shaped for it."

---

## What's next (Phase 2)

The stub we just ran is replaced in Phase 2 T1 by a real call to Claude Opus 4.7. The action will classify the brief into a layer, emit a real handoff packet, and capture tokens and cost into the workflow run; failures will mark the ticket `failed` with a typed reason. Coordinator and specialist routing arrives in T2, and live trace streaming via Supabase Realtime lands in T3 — at which point the Trace section you saw above starts updating without a refresh.
