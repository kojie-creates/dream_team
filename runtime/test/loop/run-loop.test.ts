// T5 — tests for the manual tool-use loop (ADR-001 Decision 3).
//
// Drives the REAL loop with the tape model client + the in-memory trace sink +
// a temp-workspace + the REAL gate/grants (roleGrant('code-developer')) and the
// REAL write_file tool. Covers (per task T5 done-criterion):
//
//   1. Happy path: tape = [tool_use write_file (in-workspace) → end_turn]. Assert
//      the file was written with the right content; a tool.executed event with
//      gate_decision 'permit', capability 'W', tier 'T3'; the loop ended on
//      end_turn; count(tool.executed) == count(tool calls).
//   2. Blocked path: a tool whose capability is NOT in the code-developer grant
//      (the matrix blocks it as blocked_scope) → the tool does NOT execute (no
//      file), a tool.executed event with a block verdict, and the model receives
//      a structured `blocked` tool_result (is_error) so it can adapt.
//   3. Message-history contract: assistant response.content appended verbatim;
//      exactly one tool_result per tool_use id in a single user turn.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runLoop } from '../../src/loop/run-loop.ts';
import type { LoopMessage } from '../../src/loop/run-loop.ts';
import { writeFileTool } from '../../src/tools/write-file.ts';
import type { RunLoopOptions } from '../../src/loop/run-loop.ts';
import type { ToolDef } from '../../src/tools/types.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import type { ApprovalSet } from '../../src/gate/types.ts';
import { softwareConfinement } from '../../src/confine/provider.ts';
import { InMemoryTraceSink } from '../harness/trace.ts';
import { sinkTraceEmitter } from '../../src/trace/emit.ts';
import { InMemoryFailureSink } from '../harness/failure.ts';
import { sinkFailureEmitter } from '../../src/packets/failure.ts';
import { tapeModelClient, toolUseTurn, endTurn } from '../harness/tape.ts';
import { makeTempWorkspace, type TempWorkspace } from '../harness/index.ts';

let ws: TempWorkspace;

beforeEach(async () => {
  ws = await makeTempWorkspace();
});

afterEach(async () => {
  await ws.cleanup();
});

const NO_APPROVALS: ApprovalSet = {
  standing: new Set(),
  perAction: new Set(),
};

/** code-developer grant from the real matrix; throws if the role is missing. */
function devGrant() {
  const grant = roleGrant('code-developer');
  if (!grant) throw new Error('test setup: code-developer grant not found');
  return grant;
}

/** Common run options for a code-developer run over the temp workspace. */
function baseOptions(tape: ReturnType<typeof tapeModelClient>, tools: RunLoopOptions['tools'], seed: LoopMessage[]) {
  const sink = new InMemoryTraceSink();
  const failureSink = new InMemoryFailureSink();
  return {
    sink,
    failureSink,
    opts: {
      modelClient: tape,
      emitter: sinkTraceEmitter(sink),
      failureEmitter: sinkFailureEmitter(failureSink),
      confinement: softwareConfinement(ws.root),
      role: 'code-developer',
      grant: devGrant(),
      approvals: NO_APPROVALS,
      tools,
      system: 'You are the code-developer specialist.',
      messages: seed,
      maxTokens: 1024,
    },
  };
}

describe('runLoop — happy path (write_file inside workspace → end_turn)', () => {
  it('writes the file, ends on end_turn, emits one permit tool.executed event', async () => {
    const tape = tapeModelClient([
      toolUseTurn([
        { id: 'toolu_1', name: 'write_file', input: { path: 'out/hello.ts', content: 'export const x = 1;\n' } },
      ]),
      endTurn(),
    ]);
    const { sink, opts } = baseOptions(
      tape,
      [writeFileTool],
      [{ role: 'user', content: 'Write out/hello.ts' }],
    );

    const result = await runLoop(opts);

    // Loop ended cleanly on end_turn.
    expect(result.state).toBe('done');

    // The file landed in-workspace with the exact content.
    const written = await readFile(join(ws.root, 'out', 'hello.ts'), 'utf8');
    expect(written).toBe('export const x = 1;\n');

    // Exactly one tool.executed event, permitting W at T3.
    const events = sink.byEventType('tool.executed');
    expect(events).toHaveLength(1);
    const payload = events[0]!.payload;
    expect(payload['gate_decision']).toBe('permit');
    expect(payload['verdict']).toBe('pass');
    expect(payload['capability']).toBe('W');
    expect(payload['tier']).toBe('T3');
    expect(payload['tool_name']).toBe('write_file');

    // count(tool.executed) == count(tool calls).
    expect(result.traceEvents).toHaveLength(1);
    expect(events.length).toBe(1);
  });

  it('appends response.content verbatim and one tool_result per tool_use id in a single user turn', async () => {
    const assistantContent = [
      { type: 'text', text: 'Writing the file now.' },
      { type: 'tool_use', id: 'toolu_a', name: 'write_file', input: { path: 'a.txt', content: 'A' } },
    ];
    const tape = tapeModelClient([
      { content: assistantContent as never, stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 } },
      endTurn(),
    ]);
    const { opts } = baseOptions(
      tape,
      [writeFileTool],
      [{ role: 'user', content: 'go' }],
    );

    const result = await runLoop(opts);

    // messages: [seed user, assistant turn (verbatim), user tool_result turn, assistant end_turn]
    expect(result.messages).toHaveLength(4);

    // Assistant turn is response.content VERBATIM (preserves text + tool_use blocks).
    const assistantTurn = result.messages[1]!;
    expect(assistantTurn.role).toBe('assistant');
    expect(assistantTurn.content).toEqual(assistantContent);

    // The next user turn carries exactly one tool_result, matching the tool_use id.
    const userTurn = result.messages[2]!;
    expect(userTurn.role).toBe('user');
    const results = userTurn.content as Array<{ type: string; tool_use_id: string }>;
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe('tool_result');
    expect(results[0]!.tool_use_id).toBe('toolu_a');
  });
});

describe('runLoop — blocked path (capability out of code-developer grant)', () => {
  // A tool declaring a capability the code-developer matrix does NOT grant (NETw
  // is ✗ for code-developer) → the REAL gate blocks it as blocked_scope before any
  // side effect. The tool has a real execute() that writes a sentinel file; if the
  // loop ever called it, the file would exist — so its absence proves no execution.
  let executed = false;
  const sentinelName = 'SHOULD_NOT_EXIST.txt';

  const forbiddenTool: ToolDef<{ path: string; content: string }> = {
    name: 'net_post',
    capability: 'NETw', // ✗ for code-developer → blocked_scope
    actionTier: 'T3',
    pathArg: 'path',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    async execute(input) {
      executed = true;
      // Reuse the real write tool so a leak would leave real evidence on disk.
      return writeFileTool.execute(
        { path: String(input.path), content: String(input.content) },
        { boundary: { workspaceRoot: ws.root, readAllowlist: [] } },
      );
    },
  };

  beforeEach(() => {
    executed = false;
  });

  it('does not execute the tool, emits a block verdict, feeds a structured blocked tool_result back', async () => {
    const tape = tapeModelClient([
      toolUseTurn([
        { id: 'toolu_b', name: 'net_post', input: { path: sentinelName, content: 'leaked' } },
      ]),
      endTurn(),
    ]);
    const { sink, opts } = baseOptions(tape, [forbiddenTool], [{ role: 'user', content: 'POST it' }]);

    const result = await runLoop(opts);

    expect(result.state).toBe('done');

    // The tool's execute() never ran...
    expect(executed).toBe(false);
    // ...and nothing landed at the sentinel path.
    await expect(stat(join(ws.root, sentinelName))).rejects.toThrow();

    // Exactly one tool.executed event, with a block verdict + the gate's decision.
    const events = sink.byEventType('tool.executed');
    expect(events).toHaveLength(1);
    const payload = events[0]!.payload;
    expect(payload['verdict']).toBe('block');
    expect(payload['gate_decision']).toBe('blocked_scope');
    expect(payload['capability']).toBe('NETw');
    expect(payload['cause']).toBe('scope_exceeded');

    // count(tool.executed) == count(tool calls).
    expect(result.traceEvents).toHaveLength(1);

    // The model received a STRUCTURED blocked tool_result (is_error) so it can adapt.
    // content is a JSON STRING (Anthropic rejects object content) carrying the fields.
    const userTurn = result.messages.find((m) => m.role === 'user' && Array.isArray(m.content))!;
    const results = userTurn.content as Array<{
      type: string;
      tool_use_id: string;
      is_error?: boolean;
      content: string;
    }>;
    expect(results).toHaveLength(1);
    expect(results[0]!.tool_use_id).toBe('toolu_b');
    expect(results[0]!.is_error).toBe(true);
    const parsed = JSON.parse(results[0]!.content);
    expect(parsed.blocked).toBe(true);
    expect(parsed.retryable).toBe(false); // out-of-grant: model can't widen its own grant
  });
});
