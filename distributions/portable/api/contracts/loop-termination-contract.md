# Loop Termination Contract

**Status:** Canonical — do not modify without governance amendment

---

## Purpose

Agent orchestration chains must have a hard iteration limit. Without one, a circular dependency (A routes to B, B escalates to A) or a runaway retry loop can execute indefinitely.

---

## Iteration Counter

Every work item carries an `iteration_count` field. This field:
- Starts at 0 when the work item enters the Central Orchestrator
- Increments by 1 at every routing decision (Orchestrator → Coordinator, Coordinator → Specialist, Specialist → Coordinator on retry, Coordinator → Truth Agent)
- Is visible in every handoff packet, every trace event, and every truth report

---

## Maximum Iterations

```
MAX_ORCHESTRATION_ITERATIONS = 15
```

This is the hard limit for any single work item's routing chain. It is deliberately conservative.

When `iteration_count >= MAX_ORCHESTRATION_ITERATIONS`:
1. The current agent **stops immediately**
2. A failure packet is emitted with `failure_type: timeout` and `detail: "orchestration iteration limit reached"`
3. The full trace is attached to the failure packet
4. The failure is escalated to Central Orchestrator (or reported to the requester if already at Orchestrator level)

No agent may suppress the iteration limit. No agent may reset the counter.

---

## Retry Constraints

- A specialist may be retried **at most once** per work item. The second failure for the same specialist on the same work item -> escalate, do not retry.
- A coordinator may reroute within its layer **at most twice** per work item. The third reroute -> escalate to Orchestrator.
- The Orchestrator may reroute across layers **at most twice** per work item. The third cross-layer reroute -> stop with reason.

---

## Detection Rule

If two consecutive trace events have the same `from` and `to` agents with no state change in between, the system is looping. The coordinator or orchestrator detecting this pattern must:
1. Halt the loop
2. Emit a failure packet with `failure_type: timeout` and `detail: "loop detected — no state change between iterations"`
3. Escalate or stop

---

## Invariants

- `iteration_count` is never reset during a work item's lifecycle
- `iteration_count` is never hidden from trace events
- The limit is enforced at every routing decision point, not just at the Orchestrator
