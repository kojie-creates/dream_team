# Decisions Log — Dream Team Executable Core

Strategic decisions made by the owner (Felix). Technical/internal decisions live in the ADR.

---

## 2026-06-07 — Four strategic decisions

| # | Question | Decision | Impact |
|---|---|---|---|
| 1 | Deployment form | **Electron — installable Windows app**, reusing `InnerLight_Agency_Desktop` as the wrapper reference | *(Revised 2026-06-07 from an earlier "local CLI" lean.)* Runtime = a decoupled TS module **hosted inside Electron's Node main process** (not a loopback-triggered sibling). The existing renderer is the UI; IPC (not loopback HTTP) triggers runs. The new tool-use loop + gate + confinement drop into main exactly where `claude.ts`'s single-shot `callClaude` chain sits today. **Reusable as-is:** `electron-builder.yml` (NSIS Windows installer), `keystore.ts` (BYOK), `electron.vite.config.ts`, IPC pattern, renderer shell, 28 prompts-as-TS-modules. **Ripples into ADR Decision 1/7 + task T6** — see note below. |
| 2 | Shell isolation boundary | **Docker container** | Pins ADR Decision 8's `os` ConfinementProvider to Docker (workspace bind-mounted, no host network by default, dropped caps, non-root). **Docker becomes a required dependency** for the shell slice. Restricted-user and E2B options dropped. |
| 3 | Enforcement gate (OBEXGATE question) | **In-process TS gate stays canonical** | The Python Orin sidecar is **not** coming back. ADR Decision 2 (in-process TS gate) is permanent, not a v1 stopgap. Simplifies — removes all "if Orin reintroduced" caveats and the sidecar packaging problem. Note for the raise narrative: enforcement still exists and is provable (Witness Tetrad fields logged; Ed25519 can still be added in-process), but "OBEXGATE as a separately-deployed product" is no longer the architecture. |
| 4 | Anthropic key / billing | **Bring-your-own key per user** — stored via Electron `safeStorage` (DPAPI on Windows), per `InnerLight_Agency_Desktop/src/main/keystore.ts` | User supplies their own Anthropic key, encrypted at rest by the OS, pays Anthropic directly. **No metering/billing infra needed.** GOVERNANCE_SPEC §8.2 budget caps remain as safety guardrails for the user's own spend. Reuse `keystore.ts` as-is. |

**Net effect:** mostly confirms the audited v2/ADR direction. **One real change:** deployment is Electron with the runtime hosted in main (not a loopback-triggered sibling process). New build constraint unchanged: **Docker is a prerequisite only for the later shell slice**. **Nothing here blocks T0** (the test harness is identical regardless).

---

## Ripple — ADR reconciliation (RESOLVED 2026-06-07 by the architect)

All three reconciled in ADR-001 + BUILD_ROUTING:

1. **ADR Decision 1** → runtime is a **decoupled module in Electron main**; renderer triggers via **Electron IPC** (no loopback). Decoupling rule: no `electron` imports in gate/loop/confine logic; Electron concerns isolated to `runtime/src/host/electron-adapter.ts`. The Electron renderer **replaces** the Next.js web app as the desktop UI; `app/` retained as schema/RLS owner only.
2. **ADR Decision 7** → desktop holds a **real logged-in Supabase user session** (persisted via `safeStorage`), so existing `auth.uid()` RLS scopes all writes — **no minted token, no new policies, no service-role key in the desktop.** (The InnerLight anon-key+`desktop_anon_select` precedent rejected — read-only/unscoped, unsafe for writes.)
3. **Task T6** → rewritten to **Electron IPC handler + main-process user-session Supabase client.**

**Bonus resolutions (closed, not deferred):** the two former ADR §6 "open during implementation" items are gone — *nonce re-check* (→ ADR Decision 2a: in-process gate has no nonce; filesystem TOCTOU closed by an open-once/no-follow handle rule in the tool) and *scoped-JWT TTL* (→ superseded by the user session). New implementation-level risk logged: **main-process co-tenancy** (loop crash must not kill main/UI). **T0–T5 unaffected; only T6's mechanism changed and T4 gained the TOCTOU rule + a symlink-swap test.**
