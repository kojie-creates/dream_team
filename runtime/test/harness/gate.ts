// Fake in-process gate for the T0 vitest harness.
//
// Returns scripted GateDecisions on demand (ADR-001 Decision 2 verdict union;
// Decision 2a: NO nonce). The real pure `gate()` lands in T2; the loop (T5)
// calls a gate function synchronously inside the tool boundary. For T0 tests
// that exercise the harness (and later, the loop) we want to drive verdicts
// deterministically without the real grant matrix — so the fake hands back a
// pre-scripted decision per call, in order.

import type { GateDecision, Tier } from '../../src/gate/types.ts';

/** A gate function: the loop's view of the gate is "give me a decision". */
export type GateFn = () => GateDecision;

/**
 * Build a gate that returns each scripted decision in turn. Calling past the
 * end throws — an under-provided script is a fixture bug, surfaced loudly.
 */
export function fakeGate(scriptedDecisions: GateDecision[]): GateFn {
  let cursor = 0;
  return () => {
    if (cursor >= scriptedDecisions.length) {
      throw new Error(
        `fakeGate: scripted decisions exhausted after ${scriptedDecisions.length}; gate called again`,
      );
    }
    return scriptedDecisions[cursor++]!;
  };
}

/** Convenience: a gate that permits every call at the given tier (default T3). */
export function alwaysPermit(effectiveTier: Tier = 'T3'): GateFn {
  return () => ({ verdict: 'permit', effectiveTier });
}
