# Trace Emitter Contract

**Status:** Canonical — do not modify without governance amendment

---

## Purpose

Every handoff boundary in the system emits a trace event. This makes every turn replayable, every failure attributable to a first causal break, and every routing decision auditable.

---

## Trace Event Format

```
TRACE EVENT
Sequence: [monotonic counter within the work item — 1, 2, 3...]
Timestamp: [ISO 8601 UTC]
Event type: [one of the enumerated types below]
From: [emitting agent]
To: [receiving agent, if handoff]
Verdict: [pass / block / error / degrade]
Cause: [if verdict is not pass — failure type from the taxonomy]
State snapshot: [key fields at this point — work item, routing decision, output summary]
```

---

## Event Types

| Event Type | When Emitted |
|---|---|
| `work_received` | Agent receives a handoff packet or work assignment |
| `routing_decision` | Coordinator or Orchestrator selects a target agent |
| `execution_start` | Specialist begins work |
| `execution_complete` | Specialist completes work (pass or fail) |
| `quality_check` | QA or validation step produces a verdict |
| `truth_check` | Truth Agent produces a truth validation verdict |
| `escalation` | Failure escalated to a higher layer |
| `recovery_action` | Orchestrator or Coordinator takes a recovery action |
| `work_complete` | Final output delivered to requester |

---

## Trace Invariants

- Every work item has at least two trace events: `work_received` and either `execution_complete` or `escalation`.
- The first event with `verdict: block` or `verdict: error` is the **first causal break** — the root cause of the failure.
- Trace events are append-only. No event may be modified or deleted after emission.
- Every routing decision is recorded before the handoff occurs — not after.

---

## Replay Rule

Given a complete trace for a work item, an observer must be able to reconstruct:
1. The full routing path (which agents were involved, in which order)
2. The first failure point (if any)
3. What recovery action was taken (if any)
4. Whether the final output was produced by the originally-intended path or a degraded alternative
