# Phase 2 Operator Walkthrough

Date: 2026-05-24
App: `http://127.0.0.1:3000`
Workspace route: `/w/kojie-san-workspace`

## Purpose

This walkthrough verifies the Phase 2 happy path from a human operator's point of view.

It does not certify the system, prove external attestation, test Realtime/SSE, test Supabase Storage, or test PDF/OCR. It verifies the current Phase 2 scope: paste brief, upload text/markdown brief, run the internal workflow, and inspect recorded evidence.

## Before Starting

Confirm:

1. You are signed in.
2. You are on `http://127.0.0.1:3000/w/kojie-san-workspace`.
3. The app is using the Dream Team Supabase project, not Orin.
4. If you want a live Anthropic classification, `.env.local` has `MODEL_PROVIDER_MODE=anthropic` and the dev server was restarted after the change.
5. If you do not want to spend model budget, dry mode is acceptable for this walkthrough.

## Paste Fixture

Use this text for the paste flow:

```text
Phase 2 acceptance paste fixture.

Build a short launch-readiness brief for Dream Team. Focus on the current product loop: brief intake, ticket creation, orchestrator classification, specialist artifact, QA evidence, Truth evidence, and operator review.

Return a concise plan with three sections:
1. What is ready to show.
2. What should be caveated.
3. What should happen next.
```

## Upload Fixture

Use this file:

`docs/demo/fixtures/phase2_upload_fixture.md`

## Walkthrough A: Paste Flow

1. From workspace Home, click the paste/new brief path if visible. If not visible, go directly to:
   `http://127.0.0.1:3000/w/kojie-san-workspace/new/paste`
2. Paste the Paste Fixture text.
3. Submit the brief.
4. Confirm you land on a ticket detail page.
5. Confirm the progress strip is visible near the top.
6. Click `Run Orchestrator`.
7. Wait for the page to refresh or click `Refresh status`.
8. Confirm the Orchestrator step is complete and trace evidence appears.
9. Click `Run Specialist Pass`.
10. Wait for refresh.
11. Confirm an Artifacts section appears.
12. Confirm artifact metadata appears: kind, MIME/type, bytes, created time, and content.
13. Click `Run QA + Truth Review`.
14. Wait for refresh.
15. Confirm QA evidence appears.
16. Confirm Truth evidence appears.
17. Confirm the progress strip reaches Truth.
18. Confirm the ticket status is `done`.

## Walkthrough B: Upload Flow

1. Return to workspace Home:
   `http://127.0.0.1:3000/w/kojie-san-workspace`
2. Click `Upload a brief`.
3. Select:
   `docs/demo/fixtures/phase2_upload_fixture.md`
4. Submit the upload.
5. Confirm you land on a new ticket detail page.
6. Confirm the page indicates the brief came from a file if that metadata is surfaced.
7. Click `Run Orchestrator`.
8. Click `Run Specialist Pass`.
9. Click `Run QA + Truth Review`.
10. Confirm the progress strip reaches Truth.
11. Confirm Artifacts, QA evidence, and Truth evidence are visible.
12. Confirm no PDF/OCR/storage/download claim appears.

## Optional DB Readback

After each flow, capture the ticket ID from the URL:

`/w/kojie-san-workspace/tickets/<ticketId>`

Then ask Codex for a DB readback using that ticket ID. Expected fields:

1. ticket title
2. ticket status
3. brief source
4. trace event count
5. packet count
6. artifact count
7. latest event type

## Pass Criteria

Pass if:

1. Paste brief creates a ticket.
2. Upload fixture creates a ticket.
3. Orchestrator action records classification evidence.
4. Specialist action records artifact evidence.
5. QA + Truth action records internal review evidence.
6. Progress strip reaches Truth.
7. Ticket reaches `done`.
8. Artifact viewer is honest about DB-backed packet content and does not imply file download/storage.

## Fail Criteria

Fail if:

1. A button does nothing and no error is shown.
2. Evidence sections do not appear after refresh.
3. Duplicate clicks create duplicate artifacts or duplicate QA/Truth evidence.
4. Upload accepts unsupported binary files.
5. The UI claims certification, external attestation, Realtime/SSE, PDF/OCR, or Storage support.
