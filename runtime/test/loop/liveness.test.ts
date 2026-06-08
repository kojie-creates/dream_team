// T9 — liveness check + artifact recording (ADR-001 §6 success-criterion #1,
// task T9; PROJECT_BRIEF_executable_core_v2 §6.1: a "working" artifact is a
// DEFINED liveness check, NOT "file exists").
//
// Drives the REAL loop (tape + in-memory trace/failure sinks + temp-workspace +
// real gate/grants + real write_file) so the file under test is produced by the
// genuine write path, then runs the T9 post-run step (checkLiveness /
// recordArtifactIfLive) over the in-memory ArtifactEmitter seam.
//
// Coverage (per task T9 done-criterion):
//   1. HAPPY PATH: a file is written with known content inside the workspace →
//      the liveness check PASSES (content matches + non-empty) → an ArtifactRecord
//      is recorded with the correct byte length and kind. Asserts the record fields.
//   2. NEGATIVE (proves the check is NOT vacuous):
//      (a) EMPTY file → NOT live (reason 'empty'), NO success artifact recorded.
//      (b) WRONG content (predicate unmet) → NOT live (reason 'predicate_unmet'),
//          NO success artifact recorded.
//      Both assert "file exists but is empty/wrong" is treated as NOT live —
//      distinguishing liveness from mere existence (the critical assertion: a
//      liveness check that always passes is worthless).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runLoop } from '../../src/loop/run-loop.ts';
import type { LoopMessage, RunLoopOptions } from '../../src/loop/run-loop.ts';
import { writeFileTool } from '../../src/tools/write-file.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import type { ApprovalSet } from '../../src/gate/types.ts';
import { softwareConfinement } from '../../src/confine/provider.ts';
import { InMemoryTraceSink } from '../harness/trace.ts';
import { sinkTraceEmitter } from '../../src/trace/emit.ts';
import { InMemoryFailureSink } from '../harness/failure.ts';
import { sinkFailureEmitter } from '../../src/packets/failure.ts';
import { InMemoryArtifactSink } from '../harness/artifact.ts';
import {
  recordArtifactIfLive,
  checkLiveness,
  sinkArtifactEmitter,
  contentEquals,
  type RecordContext,
} from '../../src/artifacts/record.ts';
import { tapeModelClient, toolUseTurn, endTurn } from '../harness/tape.ts';
import { makeTempWorkspace, type TempWorkspace } from '../harness/index.ts';

let ws: TempWorkspace;

beforeEach(async () => {
  ws = await makeTempWorkspace();
});

afterEach(async () => {
  await ws.cleanup();
});

const NO_APPROVALS: ApprovalSet = { standing: new Set(), perAction: new Set() };

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const TICKET_ID = '00000000-0000-0000-0000-0000000000a9';

const RECORD_CTX: RecordContext = {
  workspaceId: WORKSPACE_ID,
  ticketId: TICKET_ID,
  role: 'code-developer',
};

function devGrant() {
  const grant = roleGrant('code-developer');
  if (!grant) throw new Error('test setup: code-developer grant not found');
  return grant;
}

/** Run options for a code-developer run over the temp workspace (mirrors run-loop.test). */
function runOptions(
  tape: ReturnType<typeof tapeModelClient>,
  seed: LoopMessage[],
): { sink: InMemoryTraceSink; opts: RunLoopOptions } {
  const sink = new InMemoryTraceSink();
  return {
    sink,
    opts: {
      modelClient: tape,
      emitter: sinkTraceEmitter(sink),
      failureEmitter: sinkFailureEmitter(new InMemoryFailureSink()),
      confinement: softwareConfinement(ws.root),
      role: 'code-developer',
      grant: devGrant(),
      approvals: NO_APPROVALS,
      tools: [writeFileTool],
      system: 'You are the code-developer specialist.',
      messages: seed,
      maxTokens: 1024,
    },
  };
}

describe('T9 liveness — happy path (real run produces a live artifact)', () => {
  it('records an ArtifactRecord with the real byte length and kind when content matches + non-empty', async () => {
    const relPath = join('out', 'hello.ts');
    const content = 'export const x = 1;\n';

    // Drive the real loop so the file is produced by the genuine write path.
    const tape = tapeModelClient([
      toolUseTurn([{ id: 'toolu_1', name: 'write_file', input: { path: relPath, content } }]),
      endTurn(),
    ]);
    const { opts } = runOptions(tape, [{ role: 'user', content: 'Write out/hello.ts' }]);
    const result = await runLoop(opts);
    expect(result.state).toBe('done');

    // T9 post-run step: declare the post-condition (content equals known + the
    // 'file' kind), run the liveness gate, record only if live.
    const absPath = join(ws.root, relPath);
    const artifactSink = new InMemoryArtifactSink();
    const liveness = await recordArtifactIfLive(
      { absPath, predicate: contentEquals(content), kind: 'file', mimeType: 'text/x-typescript' },
      RECORD_CTX,
      sinkArtifactEmitter(artifactSink),
    );

    // The artifact is LIVE with the real byte length.
    expect(liveness.live).toBe(true);
    const expectedBytes = Buffer.byteLength(content, 'utf8');
    if (liveness.live) {
      expect(liveness.bytes).toBe(expectedBytes);
    }

    // Exactly one ArtifactRecord recorded, mirroring the `artifacts` row shape.
    const rows = artifactSink.all();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.kind).toBe('file');
    expect(row.bytes).toBe(expectedBytes); // REAL byte length, not a placeholder
    expect(row.storage_path).toBeNull(); // ADR §4.4: Storage upload deferred
    expect(row.mime_type).toBe('text/x-typescript');
    expect(row.workspace_id).toBe(WORKSPACE_ID);
    expect(row.ticket_id).toBe(TICKET_ID);
  });

  it("records kind 'markdown' for a markdown artifact when its content predicate passes", async () => {
    const relPath = 'README.md';
    const content = '# Title\n\nbody\n';
    const tape = tapeModelClient([
      toolUseTurn([{ id: 'toolu_md', name: 'write_file', input: { path: relPath, content } }]),
      endTurn(),
    ]);
    const { opts } = runOptions(tape, [{ role: 'user', content: 'Write README.md' }]);
    await runLoop(opts);

    const artifactSink = new InMemoryArtifactSink();
    const liveness = await recordArtifactIfLive(
      { absPath: join(ws.root, relPath), predicate: contentEquals(content), kind: 'markdown' },
      RECORD_CTX,
      sinkArtifactEmitter(artifactSink),
    );

    expect(liveness.live).toBe(true);
    const rows = artifactSink.all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('markdown');
    expect(rows[0]!.bytes).toBe(Buffer.byteLength(content, 'utf8'));
  });
});

describe('T9 liveness — negative (the check is NOT vacuous; empty/wrong is NOT live)', () => {
  it('EMPTY file (exists but zero bytes) → NOT live, NO success artifact recorded', async () => {
    // A file that EXISTS but is empty. write_file refuses empty content paths via
    // its own write, so create the zero-byte file directly to prove the liveness
    // check — not the writer — is what rejects "exists but empty".
    const absPath = join(ws.root, 'empty.txt');
    await writeFile(absPath, '', 'utf8');

    const artifactSink = new InMemoryArtifactSink();
    const liveness = await recordArtifactIfLive(
      { absPath, predicate: contentEquals('anything'), kind: 'file' },
      RECORD_CTX,
      sinkArtifactEmitter(artifactSink),
    );

    // Mere existence is NOT liveness: a zero-byte file is rejected as 'empty'.
    expect(liveness.live).toBe(false);
    if (!liveness.live) {
      expect(liveness.reason).toBe('empty');
    }
    // CRITICAL: no success artifact was recorded on a non-live result.
    expect(artifactSink.count()).toBe(0);
    expect(artifactSink.all()).toHaveLength(0);
  });

  it('WRONG content (predicate unmet) → NOT live, NO success artifact recorded', async () => {
    // The file is written (non-empty, real) BUT its content does not satisfy the
    // declared post-condition. A vacuous check would pass here; a real one fails.
    const relPath = 'config.txt';
    const actualContent = 'WRONG VALUE\n';
    const expectedContent = 'EXPECTED VALUE\n';
    const tape = tapeModelClient([
      toolUseTurn([{ id: 'toolu_w', name: 'write_file', input: { path: relPath, content: actualContent } }]),
      endTurn(),
    ]);
    const { opts } = runOptions(tape, [{ role: 'user', content: 'Write config.txt' }]);
    await runLoop(opts);

    const absPath = join(ws.root, relPath);

    // checkLiveness directly: the file is non-empty (so NOT 'empty') but the
    // predicate is unmet → reason 'predicate_unmet'. This distinguishes liveness
    // from existence AND from "non-empty" — content must be RIGHT.
    const raw = await checkLiveness({ absPath, predicate: contentEquals(expectedContent), kind: 'file' });
    expect(raw.live).toBe(false);
    if (!raw.live) {
      expect(raw.reason).toBe('predicate_unmet');
    }

    // recordArtifactIfLive over the same spec records NOTHING.
    const artifactSink = new InMemoryArtifactSink();
    const liveness = await recordArtifactIfLive(
      { absPath, predicate: contentEquals(expectedContent), kind: 'file' },
      RECORD_CTX,
      sinkArtifactEmitter(artifactSink),
    );
    expect(liveness.live).toBe(false);
    expect(artifactSink.count()).toBe(0);
  });

  it("MISSING file → NOT live (reason 'missing'), NO success artifact recorded", async () => {
    // Nothing was written at all. The gate must reject, not pass-by-default.
    const absPath = join(ws.root, 'never-written.txt');
    const artifactSink = new InMemoryArtifactSink();
    const liveness = await recordArtifactIfLive(
      { absPath, predicate: contentEquals('x'), kind: 'file' },
      RECORD_CTX,
      sinkArtifactEmitter(artifactSink),
    );
    expect(liveness.live).toBe(false);
    if (!liveness.live) {
      expect(liveness.reason).toBe('missing');
    }
    expect(artifactSink.count()).toBe(0);
  });

  it('a throwing predicate is fail-closed (predicate_unmet), never a silent pass', async () => {
    // A liveness check that swallowed a thrown predicate into a pass would be
    // worthless. Prove a throw → NOT live, nothing recorded.
    const absPath = join(ws.root, 'present.txt');
    await writeFile(absPath, 'present\n', 'utf8');
    const artifactSink = new InMemoryArtifactSink();
    const liveness = await recordArtifactIfLive(
      {
        absPath,
        predicate: () => {
          throw new Error('predicate boom');
        },
        kind: 'file',
      },
      RECORD_CTX,
      sinkArtifactEmitter(artifactSink),
    );
    expect(liveness.live).toBe(false);
    if (!liveness.live) {
      expect(liveness.reason).toBe('predicate_unmet');
    }
    expect(artifactSink.count()).toBe(0);
  });
});
