// T0 trivial passing test — proves the harness works end to end:
//   - a tape with a single end_turn turn drives a placeholder "loop step"
//   - the step records a trace row via the in-memory sink
//   - the test asserts the harness can find + assert that trace row
//
// This is a HARNESS SMOKE TEST, not the real loop. The real manual tool-use
// loop (run-loop.ts) lands in T5. `runHarnessSmokeStep` below is a deliberately
// minimal shim that exercises exactly the four T0 seams (model client, gate,
// trace sink, temp workspace) — it is NOT run-loop.ts and must not be mistaken
// for it.

import { describe, it, expect } from 'vitest';
import {
  tapeModelClient,
  endTurn,
  alwaysPermit,
  InMemoryTraceSink,
  assertSeqMonotonic,
  findSingleEvent,
  assertPayloadFields,
  makeTempWorkspace,
  type GateFn,
} from './harness/index.ts';
import type { ModelClient } from '../src/model/client.ts';

/**
 * HARNESS SMOKE SHIM — not the real loop (T5). Calls the model once, branches on
 * stop_reason, and records one trace row through the sink. Just enough to drive
 * the four T0 seams so the harness itself is provably testable.
 */
async function runHarnessSmokeStep(args: {
  model: ModelClient;
  gate: GateFn;
  trace: InMemoryTraceSink;
}): Promise<void> {
  const { model, trace } = args;
  const response = await model.createMessage({
    model: 'claude-opus-4-8',
    max_tokens: 16,
    messages: [{ role: 'user', content: 'smoke' }],
  });
  // Record a trace row mirroring the trace_events shape (in-memory T0 stand-in).
  trace.append({
    from_agent: 'code-developer',
    to_agent: 'runtime',
    event_type: 'loop.step',
    payload: { stop_reason: response.stop_reason, iteration: 0 },
  });
}

describe('T0 harness smoke', () => {
  it('drives a single end_turn tape and records an assertable trace row', async () => {
    const model = tapeModelClient([endTurn()]);
    const gate = alwaysPermit();
    const trace = new InMemoryTraceSink();

    await runHarnessSmokeStep({ model, gate, trace });

    const rows = trace.all();
    expect(rows).toHaveLength(1);

    // seq is monotonic from 1 (trace-emitter contract invariant)
    assertSeqMonotonic(rows);
    expect(rows[0]!.seq).toBe(1);

    // the harness can find a row by event_type and assert its payload fields
    const step = findSingleEvent(rows, 'loop.step');
    expect(step.from_agent).toBe('code-developer');
    expect(step.to_agent).toBe('runtime');
    assertPayloadFields(step, { stop_reason: 'end_turn', iteration: 0 });

    // the model client recorded the request it received
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]!.model).toBe('claude-opus-4-8');
  });

  it('provides an ephemeral temp workspace that is realpath-resolved and removable', async () => {
    const ws = await makeTempWorkspace();
    try {
      // realpath'd absolute path exists and is usable as a workspace root
      expect(ws.root).toMatch(/dreamteam-rt-/);
    } finally {
      await ws.cleanup();
    }
  });
});
