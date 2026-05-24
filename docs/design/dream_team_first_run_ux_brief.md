# UX SPECIFICATION
**From:** UX Designer
**Feature:** Dream Team v1 Dashboard — First-Run Experience & Core Surfaces
**User goal:** Sign up, understand the 28-agent org at a glance, and successfully ship a first work item through the Orchestrator pipeline.

---

## 1. Screen Inventory

| # | Screen | Purpose |
|---|---|---|
| 1 | **Sign Up / Sign In** | Email + OAuth auth. Minimal — no marketing. |
| 2 | **Onboarding (3-step)** | Workspace name, role/use-case, "what is Dream Team" primer. |
| 3 | **Home (Empty)** | Zero-state — explains the org, drives toward first ticket creation. |
| 4 | **Home (Populated)** | Ticket list/board, filters by status/layer/agent, recent traces. |
| 5 | **New Work — Upload Path** | Drop a brief file or paste text; pre-flight classification preview. |
| 6 | **New Work — Generate Path** | Prompt-the-orchestrator composer with goal + constraints. |
| 7 | **Work Detail / Trace View** | Live routing visualization, packet stream, artifact panel. |
| 8 | **Artifact Viewer** | Rendered output(s) — markdown, files, packaged bundles. |
| 9 | **Agent Catalog / Browser** | All 28 agents grouped by layer, searchable, with role + I/O contract. |
| 10 | **Agent Detail** | Single agent — identity, inputs, outputs, boundaries, sample runs. |
| 11 | **History** | All past tickets, filterable. |
| 12 | **Settings** | Workspace, members, API keys, model preferences. |
| 13 | **Billing** | Plan, usage meter (tickets/agent-runs), invoices. |
| 14 | **Failure / Loop Inspector** | Surfaces failure packets + loop-termination diagnostics. |

---

## 2. First-Run / Onboarding Flow

**Goal:** signup → first `status=done` ticket in under 5 minutes.

1. **Sign up** (email or OAuth) → land on Onboarding step 1.
2. **Step 1 — Workspace setup**: name workspace, pick role ("founder," "PM," "engineer," "researcher"). Used to seed example briefs.
3. **Step 2 — Org primer (30s skim)**: single animated diagram of the hierarchy (Orchestrator → 5 Coordinators → Specialists → Packager). Hover/tap any node = one-line role. **Skippable but not skipped by default.** This is the only place the full org is explained didactically — everywhere else it is shown, not told.
4. **Step 3 — Pick a starter path**: three cards —
   - "Generate from a goal" (recommended, prefilled with role-appropriate example)
   - "Upload a brief I already have"
   - "Just browse the agents first"
5. **Land on chosen entry surface** with the example prepopulated. User edits, hits Submit, watches the trace render live. First successful Orchestrator classification triggers a one-time confetti/checkmark and unlocks the populated Home.

**Explainer placement:** the primer in Step 2 is the only forced explanation. Subsequent education is contextual — agent badges in trace view are tappable, the Catalog is always one click from the nav.

---

## 3. No-Work-Yet Home Screen

**Layout (top-to-bottom):**
- **Hero band** — "Your team is ready. Give them something to ship." Two primary CTAs side-by-side: **[Generate work]** (filled) and **[Upload a brief]** (outlined).
- **Org snapshot** — collapsed hierarchy diagram, 5 layer chips (Build / Research / Operate / Distribution / Learning) each showing count of available specialists. Click a chip = jump to Catalog filtered to that layer. Does **not** dump all 28 agents on screen.
- **Starter prompts** — 3-4 role-tailored example cards ("Draft a launch plan," "Spec a CLI tool," "Audit a landing page"). Click = prefills the Generate composer.
- **Quiet secondary row** — "Browse all 28 agents" link + "Read the contracts" link.

**Anti-overwhelm rule:** the empty state never shows more than 5 layer chips + 4 starter cards above the fold. Depth is one click away, not on the surface.

---

## 4. Brief Upload + Generation Entry

### 4a. Upload Path
- **Affordance:** drag-drop zone OR paste textarea OR "Connect Google Drive/Notion" (post-v1).
- **Accepted:** `.md`, `.txt`, `.pdf`, raw paste. Max 50KB v1.
- **Pre-submission feedback:**
  - Word count + estimated routing layer ("Looks like a **Build** brief")
  - Detected ambiguities highlighted inline ("No success criteria found — Orchestrator may ask back")
  - Preview of which Coordinator will likely receive it
- **Validation blockers:** empty input, >50KB, unparseable file. Inline errors, not modals.
- **Submit** → trace view opens immediately with Orchestrator card pulsing.

### 4b. Generate Path
- **Affordance:** single large prompt field labeled "What do you want the team to do?" with optional structured fields below (collapsed): *Goal, Constraints, Success criteria, Deadline*.
- **Pre-submission feedback:** same routing prediction + a "Strengthen this prompt" inline hint if the goal is under 10 words.
- **Submit** → identical handoff to trace view.

Both paths produce the same downstream artifact: a ticket row in Supabase with `status=open`, then immediately picked up by the Orchestrator agent card in the trace view.

---

## 5. Core Components

| Component | Purpose |
|---|---|
| **Ticket Card** | Title, layer color stripe, status pill, owning agent badge, last-updated. |
| **Agent Badge** | Avatar + name + layer color. Clickable → Agent Detail. |
| **Layer Chip** | Color-coded pill for one of 5 layers + Orchestrator + Packager. |
| **Status Pill** | open / in_progress / done / failed / looped. Distinct color + icon. |
| **Trace Timeline** | Vertical list of trace events, monotonic seq, from→to, timestamp, expandable packet. |
| **Packet Viewer** | Collapsible labeled-field view (HANDOFF / FAILURE / TRACE). Raw + parsed toggle. |
| **Artifact Tile** | Preview + download for output files. |
| **Routing Diagram** | Live mini-map showing where the ticket currently sits in the hierarchy. |
| **Loop/Failure Banner** | Persistent banner on tickets that hit failure packet or loop-termination. |
| **Empty-state Illustration Block** | Reusable across screens with title + CTA pair. |

**Layer color coding (proposed):** Build = blue, Research = purple, Operate = green, Distribution = orange, Learning = pink, Orchestrator = neutral graphite, Packager = gold.

---

## 6. Primary User Flows

**Flow A — First work item creation**
1. Home (empty) → click **Generate work** → composer with starter prefill → edit goal → Submit → trace view opens → Orchestrator classifies → Coordinator routes → Specialist produces → QA → Truth Agent → ticket `done` → artifact rendered.

**Flow B — Checking on in-progress work**
1. Home (populated) → ticket card shows `in_progress` + current agent badge → click → trace view scrolled to latest event → live updates stream in.

**Flow C — Reviewing completed artifact**
1. Notification or Home → ticket `done` → click → Artifact Viewer is default tab, Trace is secondary tab → download / copy / "Send back with notes" action.

**Flow D — Handling failed or looped work**
1. Ticket shows `failed` or `looped` pill → click → Failure/Loop Inspector banner at top names the failure type (one of the 7) or loop signature → suggested next step ("Edit brief and resubmit" / "Approve Orchestrator's clarifying question") → one-click retry.

**Flow E — Browsing the agent catalog**
1. Nav → Catalog → grouped by layer (5 sections + Orchestrator + Packager) → filter/search → click agent → Agent Detail → "Use this agent directly" CTA (advanced — bypasses Orchestrator routing, v1.5).

---

## 7. Empty / Loading / Error States

| Screen | Empty | Loading | Error |
|---|---|---|---|
| Home | See §3 | Skeleton ticket rows | "Couldn't reach work queue — retry" |
| New Work | Placeholder prompt + examples | Submit spinner on CTA only | Inline validation errors, never lose user input |
| Trace View | "Waiting on Orchestrator…" with pulsing node | Streaming dots between agent nodes | Failure banner with packet detail |
| Artifact Viewer | "No artifact yet — work still in progress" | Shimmer on artifact tile | "Artifact failed to render — download raw" |
| Catalog | (never empty — 28 agents seeded) | Skeleton grid | "Catalog unavailable — retry" |
| History | "No past work yet" + link to New Work | Skeleton rows | Toast + retry |
| Billing | "Free tier — 0 runs used" | Skeleton meter | "Couldn't load usage" |

---

## 8. Open Questions / Risks

**For Architect:**
1. Is trace streaming push (websocket/SSE) or poll? UX assumes near-real-time updates in trace view.
2. Where does the Orchestrator's clarifying-question step surface — inline in trace view, or as a separate "needs input" ticket state? Need a 5th status.
3. Multi-tenant isolation of ticket history — workspace-scoped or user-scoped?
4. Artifact storage — Supabase storage vs. external? Affects Artifact Viewer download UX.

**For Code Developer:**
1. Live routing diagram needs a stable agent-id → coordinate mapping; suggest centralizing in a shared config.
2. Packet Viewer must preserve labeled-field formatting exactly (per contracts) — no markdown re-rendering of packet bodies.
3. Loop-termination banner must distinguish the three loop types (specialist retry / coordinator reroute / orchestrator reroute).

**Usability risks:**
- **Org primer fatigue** — forcing the hierarchy explainer may bounce users; mitigate with skip + always-available Catalog.
- **Trace view overload** — 28 agents on screen at once is a wall of nodes. Mitigate by only rendering nodes the ticket has touched, with the rest dimmed in the mini-map.
- **Two entry paths confusion** — Upload vs. Generate may feel redundant. Mitigate by making Generate the default and Upload a quieter sibling.
- **Failure packet jargon** — the 7 failure types are technical. Surface human-readable labels with the raw type as secondary text.

---

**Handoff:** Ready for Build Coordinator → Architect for technical feasibility review, then Code Developer for component build-out.
