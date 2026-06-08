# Dream Team — Organizational Governance Spec

**Purpose:** Define how the 28-agent organization is governed at the right altitude — role permissions set once, task authorization at handoff, inline checks only on dangerous actions, sign-off at acceptance, audit always. Cheap, fast, and closes the destructive-action hole that handoff-only governance would leave open.

**Enforcement substrate:** Orin / OBEXGATE `EnforcementGate`, run as a sidecar. The gate is a deterministic decision tree + Ed25519 witness signature — sub-millisecond, zero tokens, zero model cost. Latency exists only on *synchronous* gates, so those are kept rare by design.

---

## 1. Governing Principles

1. **Govern at altitude, not per keystroke.** Five altitudes: role scope (once) → assignment (per task) → execution (per action, tiered) → acceptance (per deliverable) → audit (continuous).
2. **Capability before action.** Every agent carries a standing *capability grant* (what tools/paths/scopes it may ever touch). An action outside the grant is blocked before any policy eval.
3. **Tier the action, not the agent.** Most actions are cheap, reversible, local → ungated, logged async. A small dangerous minority → gated synchronously.
4. **Default deny on consequence.** Irreversible, external, costly, or out-of-scope actions are denied unless explicitly granted *and* policy-satisfied.
5. **The author cannot be its own verifier.** Acceptance (QA, Truth) and witnessing are separate roles/process from the actor.
6. **Every action is witnessed.** Gated or not, every action appends a signed record. Audit is free (async); it never adds latency.

---

## 2. Capability Primitives (the permission vocabulary)

| Code | Capability |
|---|---|
| `MDL` | Call an LLM (within budget) |
| `R` | Read files inside the workspace |
| `W` | Write/edit files inside the agent's assigned path scope |
| `DEL` | Delete/overwrite files |
| `SH` | Execute shell commands in the sandboxed working dir |
| `NETr` | Network read — fetch/browse (GET) |
| `NETw` | Network write — external API POST/PUT |
| `CONr` / `CONw` | Connector read / write (Calendar, Drive, Slack, Supabase, …) |
| `SEC` | Read secrets / credentials |
| `DEP` | Deploy to an environment |
| `SPEND` | Incur cost beyond model tokens (paid API, infra) |
| `COMM` | Send external communication (email, public post) |
| `SPAWN` | Instantiate a sub-agent |
| `HO` | Emit a handoff packet |

---

## 3. Action Tier Taxonomy

Cells in the grant matrix (§4) carry the **tier** at which a capability is exercised, or `✗` if not granted.

| Tier | Meaning | Gate behavior | Sync? | Examples |
|---|---|---|---|---|
| **T0** | Cheap, reversible, local, in-scope | **No gate.** Append to witness log. | async — no latency | read file, write inside sandbox, run tests, browse-to-read, reason, in-budget model call |
| **T3** | Low consequence, in-grant | **Gate-lite:** auto-permit if within grant; log. | sync, trivial | scoped file write, artifact create, intra-layer handoff, dependency install (lockfile-pinned) |
| **T2** | Medium: external read/write, scope edge, structural | **Conditional:** permit if grant + policy satisfied; else *blocked-with-path* (tells agent what's missing). | sync | connector write, network API write, cross-layer handoff, sub-agent spawn, DB read, write outside assigned path but inside workspace |
| **T1** | High: irreversible / external-prod / costly / privileged | **Hard gate + human approval.** Blocked unless standing grant *and* explicit per-action approval. | sync, blocking | deploy to prod, delete outside workspace, secret access, send external comms, prod DB write, data egress, spend over threshold, privileged shell |

**Maps to Orin directly:** `T1 → BLOCKED_HARD`, `T2/T3 → BLOCKED_WITH_PATH` when prerequisites unmet, otherwise permit. T0 never reaches the gate.

**Synchronous surfaces (the only places latency exists):** handoffs, and any T1/T2 action. Everything T0 runs at full speed.

---

## 4. Capability Grant Matrix — 28 Roles

Cell = tier the role exercises that capability at. `✗` = not granted. Blank = N/A.

### Orchestrator & Coordinators (routing — no execution tools)

| Role | MDL | R | W | SH | NETr | NETw | CON | SEC | DEP | SPEND | COMM | SPAWN | HO |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| central-orchestrator | T0 | T0 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T2 (coordinators) | T2 |
| research-coordinator | T0 | T0 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T2 (its specialists) | T2 |
| build-coordinator | T0 | T0 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T2 | T2 |
| operate-coordinator | T0 | T0 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T2 | T2 |
| distribution-coordinator | T0 | T0 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T2 | T2 |
| learning-coordinator | T0 | T0 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T2 | T2 (gated upstream) |

> Coordinators route and assign. They cannot touch the filesystem, shell, or network. Their power is `SPAWN` + `HO` — both gated at T2 (assignment is the authorization surface).

### Research Layer (read-and-synthesize — no execution, no external write)

| Role | MDL | R | W | NETr | NETw | CON | SEC | DEP | SPAWN | COMM | HO |
|---|---|---|---|---|---|---|---|---|---|---|---|
| research-analyst | T0 | T0 | T3 (briefs) | T2 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T3 |
| market-intelligence | T0 | T0 | T3 (reports) | T2 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T3 |
| idea-generator | T0 | T0 | T3 (concepts) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T3 |
| knowledge-librarian | T0 | T0 | T3 (index) | T2 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T3 |

> Research scans sources and writes internal briefs — never executes, deploys, spends, or reaches outside. Browse-to-read is `NETr` T2; `idea-generator` is purely generative (no browse). Like Distribution's drafting roles, all output is internal and handed off (`HO` T3) for an approved downstream step.

### Build Layer (the primary executors)

| Role | MDL | R | W | DEL | SH | NETr | NETw | CON | SEC | DEP | SPAWN | HO |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| architect | T0 | T0 | T3 (design/ADR) | ✗ | ✗ | T2 | ✗ | ✗ | ✗ | ✗ | ✗ | T3 |
| ux-designer | T0 | T0 | T3 (design) | ✗ | ✗ | T2 | ✗ | ✗ | ✗ | ✗ | ✗ | T3 |
| code-developer | T0 | T0 | T3 (src scope) | T2 | T2 (build/test/install) | T2 | ✗ | ✗ | ✗ | ✗ | ✗ | T3 |
| qa-testing | T0 | T0 | ✗ | ✗ | T2 (run tests) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T3 |
| truth-agent | T0 | T0 | T3 (verdict/witness) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | T3 |

> `code-developer` is the heaviest actor: scoped writes (T3), but `DEL`, `SH`, and dependency install are T2. No deploy, no secrets, no external network write. `qa-testing` runs tests but is read-only on source (separation of duties). `truth-agent` only reads + signs.

### Operate Layer (highest-risk — production reach)

| Role | MDL | R | W | DEL | SH | NETr | NETw | CONr/w | SEC | DEP | SPEND | HO |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| devops | T0 | T0 | T3 (IaC/CI) | T2 | T2 | T2 | T2 | T2 / **T1** | **T1** | **T1** | **T1** | T3 |
| data-pipeline | T0 | T0 | T3 (pipeline) | T2 | T2 | T2 | T2 | T2 / **T1** (prod DB) | T2 | T2 | T2 | T3 |
| security | T0 | T0 (broad audit) | T3 (findings) | ✗ | T2 (scans) | T2 | ✗ | T2 / ✗ | **T1** (read) | ✗ | ✗ | T3 |
| performance-optimization | T0 | T0 | T3 | ✗ | T2 (profiling) | T2 | ✗ | T2 / ✗ | ✗ | ✗ | T2 | T3 |

> This layer holds the T1 capabilities — deploy, prod DB writes, secret access, spend. Each requires a standing grant **and** per-action human approval. Most engagements should run with these grants *off* and turn them on per project.

### Distribution Layer (external-communication risk)

| Role | MDL | R | W | NETr | NETw | CONr/w | COMM | HO |
|---|---|---|---|---|---|---|---|---|
| marketing-strategy | T0 | T0 | T3 (plans) | T2 | ✗ | ✗ | ✗ | T3 |
| content-creation | T0 | T0 | T3 (content) | T2 | ✗ | ✗ | ✗ | T3 |
| sales-enablement | T0 | T0 | T3 (collateral) | T2 | ✗ | ✗ | ✗ | T3 |
| community-manager | T0 | T0 | T3 (drafts) | T2 | T2 | T2 / **T1** | **T1** (external post/email) | T3 |

> Only `community-manager` can reach the outside world, and `COMM` + connector writes are T1 — gated + approved. Everyone else drafts internally; publishing is a separate, approved step.

### Learning Layer (outputs gated by Orchestrator before reaching upstream)

| Role | MDL | R | W | CONr | NETr | HO |
|---|---|---|---|---|---|---|
| analytics | T0 | T0 | T3 (specs) | T2 (DB read) | ✗ | T2 (gated upstream) |
| customer-insight | T0 | T0 | T3 | ✗ | T2 | T2 (gated upstream) |
| experimentation | T0 | T0 | T3 (+flag writes T2) | T2 | ✗ | T2 (gated upstream) |
| strategy-advisor | T0 | T0 | T3 | ✗ | ✗ | T2 (gated upstream) |

> Learning is read-and-recommend. No write to product surfaces. Every Learning handoff is gated by the Orchestrator before it can influence an upstream layer (T2, hard rule from the architecture).

### Packager

| Role | MDL | R | W | SH | DEP | COMM | HO |
|---|---|---|---|---|---|---|---|
| distribution-packager | T0 | T0 (broad) | T3 (`dist/`) | T2 (zip/build) | ✗ | ✗ | T3 |

> Assembles bundles from manifests. Builds and writes to `dist/`. Cannot deploy or distribute externally — that's a separate approved step.

---

## 5. Action → Tier Reference

Tier is assigned to the **action class**, then intersected with the role's grant. The stricter of (action tier, role's max tier for that capability) wins.

| Action | Tier |
|---|---|
| Read file in workspace; reason; in-budget model call | T0 |
| Write/edit inside assigned path; run tests; browse-to-read | T0 |
| Scoped file write outside assigned subdir (but in workspace); artifact create; intra-layer handoff; install pinned dependency | T3 |
| Shell command (sandboxed); delete inside workspace; connector read; DB read; cross-layer handoff; spawn sub-agent; network API write (non-prod) | T2 |
| Deploy; delete/write outside workspace; read secret; prod DB write; send email/public post; data egress; spend over $threshold; privileged/sudo shell | T1 |

---

## 6. Decision Flow (per action)

```
agent wants action
   │
   ├─ in capability grant?            no ──▶ BLOCK (out-of-scope, T-any)
   │   yes
   ├─ action tier = T0?               yes ─▶ EXECUTE + async witness log   ← no latency, the 95%
   │   no (T1/T2/T3)
   ├─ Orin gate (sync, deterministic)
   │     ├─ T3: in-grant?             yes ─▶ permit + log
   │     ├─ T2: grant + policy ok?    no  ─▶ BLOCKED_WITH_PATH (what's missing)
   │     │                            yes ─▶ permit + log
   │     └─ T1: standing grant + human approval?
   │                                  no  ─▶ BLOCKED_HARD
   │                                  yes ─▶ permit + log
   ▼
Witness Tetrad emitted (input + rule + decision + signature)
```

---

## 7. What This Buys You

- **Speed:** the overwhelming majority of agent work (read/write/test/reason in the sandbox) is T0 — never gated, full speed.
- **Safety:** the actions that can actually cause harm (deploy, delete, spend, external comms, secrets) are T1 — hard-gated and human-approved, regardless of which agent attempts them. Handoff-only governance would miss every one of these.
- **Org legibility:** the grant matrix *is* the org chart's access policy. A reviewer sees, at a glance, that `code-developer` can't deploy and `community-manager` can't write code.
- **Audit:** every action — gated or not — produces a signed record. SOC2 / EU AI Act evidence falls out for free.

---

## 8. Recommended Defaults

Safe-by-default. The principle: an out-of-the-box install can read, reason, write in its sandbox, and run tests freely — but cannot deploy, spend, touch secrets, reach production, or message the outside world until an operator explicitly turns those on per project. Friction lands only on the dangerous minority.

### 8.1 Operate T1 posture — **OFF by default**
Deploy, secret-read, prod DB write, and spend grants ship **disabled**. Enabled per project, per role, by an explicit operator action (a signed grant record). A fresh install cannot deploy or spend, period.

### 8.2 Spend limits
Two independent budgets, both configurable:

| Budget | Soft warn | Hard stop | Per-action gate |
|---|---|---|---|
| **Model tokens** ($) | $5 / run | $20 / run (halt) | — (T0 while under budget) |
| **Non-token spend** (paid APIs, infra) | — | $10 / run cumulative (halt) | any single action > **$1** → T1 approval |

Run = one brief's full execution. Halt = stop, emit failure packet (`scope_exceeded`), require human resume.

### 8.3 Workspace boundary
- Write/exec sandbox: `~/InnerLightAgency/workspaces/<project-id>/` — everything inside is T0/T3.
- Anything **outside** the workspace = T1 (hard-gated), including deletes and writes to the user's real files.
- Read access: workspace + an explicit per-project **read-allowlist** (e.g., a repo the user points at). Default deny reads outside the allowlist.
- **Data egress is always T1** — sending file contents over the network is gated regardless of role (anti-exfiltration).

### 8.4 Human-approval UX
- **T1 → per-action prompt:** `Allow Once` / `Allow for this session` / `Deny`. "Allow for session" is scoped to the *exact action class + path*, never global, and expires when the app closes.
- **T2 → no prompt** if in-grant and policy-satisfied (silent permit + log); `Blocked-with-path` surfaces only when a prerequisite is missing.
- **T3/T0 → never prompt.**
- Net: a normal build run prompts the user only when the agency tries something genuinely consequential.

### 8.5 Sub-agent grant inheritance

**Who may spawn.** Only the six **dispatchers** hold `SPAWN` (§4): the Central Orchestrator and the five Coordinators. Every specialist's grant omits `SPAWN`, so the `SPAWN` gate blocks a specialist's spawn as `blocked_scope` before any child is considered. In practice, therefore, *every* spawn is a dispatcher spawn.

**Delegation model (the org-graph rule).** A dispatcher is the org's delegation surface: it confers the **child role's own §4 grant** (`roleGrant(child)`), bounded by the **routing chart** (`gate/org.ts`, `mayRoute`). It is *not* an intersection with the spawner's own caps — Coordinators are intentionally thin (§4: no `W`/`SH`), so a literal `parent ∩ requested` would strangle their children (a Coordinator could never empower a Code Developer to write). The chart, not the spawner's caps, is the bound.

- **No cross-layer reach.** A dispatcher may instantiate only the roles in its chart row: the Orchestrator → the five Coordinators (+ Packager); each Coordinator → its own layer's specialists. A request outside the chart is refused (`out of org chart`) before the child runs.
- **Invariant.** A child can never exceed the **§4 grant of the role it runs as**. Conferring a downstream role at that role's defined ceiling is delegation, not escalation — the dispatcher gains nothing; it instantiates a bounded role.
- **Tool surface follows the grant.** A child receives exactly the tools whose capability its grant holds (`tools/registry.ts`, `toolsForRole`). A Coordinator child physically cannot receive `write_file`/`shell`; only `SPAWN`-holders receive `spawn`. This is a second guard behind the gate.

**Escalation guard (retained as defense).** The classic §8.5 rule — child grant = **parent grant ∩ requested grant**, never a superset — still applies to any *non-dispatcher* `SPAWN`-holder (`gate/intersect.ts`): such a spawner narrows literally and can never escalate. Because no specialist holds `SPAWN` today, the escalation path this guards (a specialist minting a more-powerful peer) is unreachable — but the intersection remains the fail-closed default.

**Bounds.** Spawn depth cap = **3**; total agent count bounded by the loop-termination contract (`MAX_ORCHESTRATION_ITERATIONS = 15`). A request past either cap is refused — the child is not run. Enforced at the `SPAWN` gate (T2).

### 8.6 Connector scope → tier defaults
Read = T2, write = T1. All connector **writes OFF** by default (per §8.1 posture).

| Connector | Read | Write |
|---|---|---|
| Google Calendar | `readonly` → T2 | `events` → **T1** |
| Google Drive | read → T2 | write → **T1** |
| Slack | read → T2 | post/message → **T1** |
| Supabase | read → T2 | non-prod write → T2 · prod write → **T1** |

### 8.7 Audit retention
Witness Tetrad records: **keep all**, append-only, exportable (JSON-lines + signature chain). No auto-purge by default — retention policy set per deployment if needed.
