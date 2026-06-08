// Barrel for the T0 vitest harness (ADR-001 §3 runtime/test/harness/).
// Re-exports the four seams the harness provides: injectable model client +
// tape fixtures, fake in-process gate, ephemeral temp-workspace, and the
// in-memory trace sink + assertion helpers.

export * from './tape.ts';
export * from './gate.ts';
export * from './workspace.ts';
export * from './trace.ts';
export * from './failure.ts';
export * from './artifact.ts';
