// Phase 2 T3 — honest-copy static smoke.
// Asserts the T3 user-facing surfaces no longer say "stub" anywhere a user
// would read. The component file is still named *Stub* on disk (rename
// deferred to keep the diff narrow); only rendered text counts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const targets = [
  'src/app/w/[slug]/tickets/[ticketId]/page.tsx',
  'src/components/tickets/RunOrchestratorStubButton.tsx',
  'src/components/tickets/RunSpecialistPassButton.tsx',
  'src/components/tickets/RunQaTruthReviewButton.tsx',
  'src/components/tickets/TicketProgressStrip.tsx',
  'src/components/tickets/TicketAutoRefresh.tsx',
  'src/components/briefs/UploadBriefForm.tsx',
  'src/app/w/[slug]/new/upload/page.tsx',
  'src/app/w/[slug]/agents/page.tsx',
  'src/app/w/[slug]/history/page.tsx',
  'src/app/w/[slug]/settings/page.tsx',
  'src/components/workspace/WorkspaceNav.tsx',
];

// T4 honest-copy targets: surfaces that talk about QA / Truth review must not
// overclaim external attestation. If any of these words appear, they must be
// adjacent to an explicit negation (e.g. "no external attestation").
const t4Targets = [
  'src/app/w/[slug]/tickets/[ticketId]/page.tsx',
  'src/components/tickets/RunQaTruthReviewButton.tsx',
];
const overclaimPattern = /\b(attested|certified|external\s+review|third[-\s]?party\s+attestation)\b/i;

// T5 honest-copy: surfaces that show refresh/polling must not imply streaming
// transport when only polling/refresh is implemented. Allow with adjacent
// negation, same 80-char window rule.
const t5Targets = [
  'src/app/w/[slug]/tickets/[ticketId]/page.tsx',
  'src/components/tickets/TicketProgressStrip.tsx',
  'src/components/tickets/TicketAutoRefresh.tsx',
];
const streamingPattern = /\b(realtime|real-time|sse|server[-\s]sent\s+events|live\s+stream|streaming|websocket)\b/i;

// T6 honest-copy: upload + artifact surfaces must not overclaim. PDF, OCR,
// downloadable artifact files, or Supabase Storage references are forbidden
// unless adjacent negation appears within an 80-char window.
const t6Targets = [
  'src/app/w/[slug]/tickets/[ticketId]/page.tsx',
  'src/app/w/[slug]/new/upload/page.tsx',
  'src/components/briefs/UploadBriefForm.tsx',
];
const uploadOverclaimPattern = /\b(pdf|ocr|docx|supabase\s+storage|storage\s+bucket)\b/i;

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
}

// Allow `stub` only inside identifiers (component import name) and inside
// strings that are obviously not user-facing (form field hidden names etc).
// Practical rule: forbid any case-insensitive 'stub' inside JSX text content
// or string literals rendered to the user.
function stripIdentifierStub(src) {
  // Remove the component import/usage tokens we know are non-rendered.
  return src
    .replace(/RunOrchestratorStubButton/g, 'RunOrchestratorButton')
    .replace(/canRunStub/g, 'canRun');
}

for (const rel of targets) {
  const abs = path.join(root, rel);
  const src = stripIdentifierStub(readFileSync(abs, 'utf8'));
  const hit = src.match(/stub/i);
  check(
    `no rendered "stub" copy in ${rel}`,
    hit === null,
    `expected no /stub/i; found "${hit?.[0]}" at offset ${hit?.index}`,
  );
}

for (const rel of t4Targets) {
  const abs = path.join(root, rel);
  const src = readFileSync(abs, 'utf8');
  const hit = src.match(overclaimPattern);
  let ok = hit === null;
  if (!ok) {
    // Allow if a negation appears within 80 chars before/after the hit.
    const ctxStart = Math.max(0, hit.index - 80);
    const ctxEnd = Math.min(src.length, hit.index + hit[0].length + 80);
    const ctx = src.slice(ctxStart, ctxEnd).toLowerCase();
    if (/\b(no|not|never|without)\b/.test(ctx)) ok = true;
  }
  check(
    `no unguarded external-attestation claim in ${rel}`,
    ok,
    `found "${hit?.[0]}" at offset ${hit?.index} without nearby negation`,
  );
}

for (const rel of t5Targets) {
  const abs = path.join(root, rel);
  const src = readFileSync(abs, 'utf8');
  const hit = src.match(streamingPattern);
  let ok = hit === null;
  if (!ok) {
    const ctxStart = Math.max(0, hit.index - 80);
    const ctxEnd = Math.min(src.length, hit.index + hit[0].length + 80);
    const ctx = src.slice(ctxStart, ctxEnd).toLowerCase();
    if (/\b(no|not|never|without)\b/.test(ctx)) ok = true;
  }
  check(
    `no unguarded streaming-transport claim in ${rel}`,
    ok,
    `found "${hit?.[0]}" at offset ${hit?.index} without nearby negation`,
  );
}

for (const rel of t6Targets) {
  const abs = path.join(root, rel);
  const src = readFileSync(abs, 'utf8');
  const hit = src.match(uploadOverclaimPattern);
  let ok = hit === null;
  if (!ok) {
    const ctxStart = Math.max(0, hit.index - 80);
    const ctxEnd = Math.min(src.length, hit.index + hit[0].length + 80);
    const ctx = src.slice(ctxStart, ctxEnd).toLowerCase();
    if (/\b(no|not|never|without|nothing)\b/.test(ctx)) ok = true;
  }
  check(
    `no unguarded upload-overclaim in ${rel}`,
    ok,
    `found "${hit?.[0]}" at offset ${hit?.index} without nearby negation`,
  );
}

// Phase 4 T1 honest-copy: failure UI must not promise retry/resolve/reroute
// actions before those actions exist. The failure packet body_parsed may
// contain a `recovery_suggestion: retry` value rendered as data — that is a
// label of recorded evidence, not a UI promise — so we forbid action-style
// phrasings only (button, link, "click to", "available"), not the bare word.
const t4FailureTargets = [
  'src/app/w/[slug]/tickets/[ticketId]/page.tsx',
  'src/components/tickets/FailureEvidencePanel.tsx',
];
const failureActionPattern =
  /\b(retry|resolve|reroute|rerun)\s+(button|link|action|available|now)\b|\bclick\s+to\s+(retry|resolve|reroute|rerun)\b/i;
for (const rel of t4FailureTargets) {
  const abs = path.join(root, rel);
  const src = readFileSync(abs, 'utf8');
  const hit = src.match(failureActionPattern);
  check(
    `no promised retry/resolve action in ${rel}`,
    hit === null,
    `found "${hit?.[0]}" at offset ${hit?.index}`,
  );
}

// Phase 4 T1 honest-copy: FailureEvidencePanel must carry the explicit
// "no recovery action is wired yet" caveat so the read-only nature of the
// surface is stated to the operator.
{
  const rel = 'src/components/tickets/FailureEvidencePanel.tsx';
  const abs = path.join(root, rel);
  const src = readFileSync(abs, 'utf8');
  const ok = /no recovery action is wired yet/i.test(src);
  check(
    `failure panel states "no recovery action is wired yet" in ${rel}`,
    ok,
    'expected the literal phrase to appear in rendered text',
  );
}

let failed = 0;
for (const c of checks) {
  if (c.ok) {
    console.log(`  ok  - ${c.name}`);
  } else {
    failed++;
    console.error(`  FAIL- ${c.name}: ${c.detail}`);
  }
}
if (failed > 0) {
  console.error(`copy-smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log(`copy-smoke: OK (${checks.length} checks)`);
