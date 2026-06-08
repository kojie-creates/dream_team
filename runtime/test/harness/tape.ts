// "Tape" fixture format + tapeModelClient factory for the T0 vitest harness.
//
// A tape is a scripted sequence of model responses: each entry is one
// `CreateMessageResponse` the fake returns on successive `createMessage` calls,
// in order. This makes the loop deterministic and testable with zero network
// (ADR-001 §3: injectable model client; brief §4.0: tape-driven harness).
//
// Construction helpers build the three response shapes the loop branches on
// (ADR Decision 3 step 4): a text+end_turn turn, a tool_use turn, and a bare
// end_turn turn. usage defaults to zero (cost accounting is exercised in T7).

import type {
  ContentBlock,
  CreateMessageRequest,
  CreateMessageResponse,
  ModelClient,
  ModelUsage,
} from '../../src/model/client.ts';

/** A tape: the ordered responses the fake replays, one per createMessage call. */
export type Tape = CreateMessageResponse[];

const ZERO_USAGE: ModelUsage = { input_tokens: 0, output_tokens: 0 };

/** A turn that emits text and ends (stop_reason end_turn). */
export function textTurn(text: string, usage: ModelUsage = ZERO_USAGE): CreateMessageResponse {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage };
}

/** A bare end_turn turn with no content (the trivial smoke-test case). */
export function endTurn(usage: ModelUsage = ZERO_USAGE): CreateMessageResponse {
  return { content: [], stop_reason: 'end_turn', usage };
}

/** A turn requesting one or more tool_use blocks (stop_reason tool_use). */
export function toolUseTurn(
  toolUses: Array<{ id: string; name: string; input: unknown }>,
  usage: ModelUsage = ZERO_USAGE,
): CreateMessageResponse {
  const content: ContentBlock[] = toolUses.map((t) => ({
    type: 'tool_use',
    id: t.id,
    name: t.name,
    input: t.input,
  }));
  return { content, stop_reason: 'tool_use', usage };
}

/**
 * Build a ModelClient that replays `tape` turn by turn. Each `createMessage`
 * call returns the next response; calling past the end throws (a tape that
 * under-runs the loop is a fixture bug, surfaced loudly rather than hanging).
 * Captures requests for assertions.
 */
export function tapeModelClient(tape: Tape): ModelClient & { requests: CreateMessageRequest[] } {
  let cursor = 0;
  const requests: CreateMessageRequest[] = [];
  return {
    requests,
    createMessage(req: CreateMessageRequest): Promise<CreateMessageResponse> {
      requests.push(req);
      if (cursor >= tape.length) {
        return Promise.reject(
          new Error(`tapeModelClient: tape exhausted after ${tape.length} turn(s); loop requested more`),
        );
      }
      const response = tape[cursor++]!;
      return Promise.resolve(response);
    },
  };
}
