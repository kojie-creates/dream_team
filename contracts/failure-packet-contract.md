# Failure Packet Contract

**Status:** Canonical — do not modify without governance amendment

---

## Purpose

Every agent must be able to report failure, not just success. Without a failure packet format, a silent specialist failure is invisible to the system. The orchestrator sees no output and has no mechanism to detect, classify, or recover from the failure.

---

## Failure Packet Format

Every agent — specialist, coordinator, and orchestrator — uses this format when work cannot be completed:

```
FAILURE PACKET
From: [agent name]
To: [coordinator or orchestrator name]
Work item: [original work item]
Failure type: [one of the enumerated types below]
Detail: [specific — what failed and why]
State at failure: [what was completed before the failure]
Recovery suggestion: [retry / reroute / degrade / stop — with reason]
```

---

## Failure Type Taxonomy (Closed)

These are the only valid failure types. New types require a governance amendment.

| Failure Type | Meaning |
|---|---|
| `input_missing` | Required input was not provided or is incomplete |
| `input_invalid` | Input was provided but does not match the expected schema |
| `dependency_unavailable` | An external system, API, or data source is unreachable |
| `execution_error` | The agent attempted work but encountered an error during execution |
| `quality_gate_fail` | Output was produced but does not meet quality criteria |
| `scope_exceeded` | Work item requires capability outside this agent's boundaries |
| `timeout` | Work did not complete within the allowed time or iteration limit |

---

## Handling Rules

**Specialists** emit failure packets to their Layer Coordinator.

**Coordinators** handle failure packets:
1. If the failure is retryable and the specialist has not already retried -> route back with corrected input
2. If the failure requires a different specialist -> reroute within the layer
3. If the failure cannot be resolved within the layer -> escalate to Central Orchestrator with the failure packet attached

**Central Orchestrator** handles escalated failure packets:
1. Classify: which layer can resolve this?
2. If resolvable -> route with a resolution packet
3. If not resolvable -> emit a stop record with the failure chain attached

---

## Invariants

- No agent may silently return empty output. Empty output without a failure packet is a contract violation.
- No coordinator may absorb a failure without either resolving it or escalating it.
- The orchestrator must acknowledge every escalated failure — no failure packet may be dropped.
