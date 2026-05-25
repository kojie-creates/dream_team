'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service';
import {
  classifyBrief,
  ModelProviderError,
  CLASSIFY_PROMPT_VERSION,
} from '@/lib/model/provider';
import { env } from '@/env';

export type OrchestratorRunState = { error: string | null };

const EVENT_TYPE = 'orchestrator.classified';

export async function runOrchestratorClassification(
  _prev: OrchestratorRunState,
  form: FormData,
): Promise<OrchestratorRunState> {
  const slug = String(form.get('slug') ?? '').trim();
  const ticketId = String(form.get('ticketId') ?? '').trim();

  if (!slug || !ticketId) return { error: 'Missing workspace or ticket.' };

  // -- 1. RLS-gated authorization read ---------------------------------------
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: workspace, error: wsErr } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (wsErr) return { error: wsErr.message };
  if (!workspace) return { error: 'Workspace not found or access denied.' };

  const { data: ticket, error: tErr } = await supabase
    .from('tickets')
    .select('id, status, workspace_id, brief_id')
    .eq('id', ticketId)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (tErr) return { error: tErr.message };
  if (!ticket) return { error: 'Ticket not found or access denied.' };

  if (ticket.status !== 'open') {
    // Idempotent: only an `open` ticket can be classified. Re-renders detail.
    revalidatePath(`/w/${slug}/tickets/${ticket.id}`);
    return { error: null };
  }

  // Brief content — also via RLS-gated session client.
  let briefText = '';
  if (ticket.brief_id) {
    const { data: brief, error: bErr } = await supabase
      .from('briefs')
      .select('raw_text')
      .eq('id', ticket.brief_id)
      .maybeSingle();
    if (bErr) return { error: bErr.message };
    briefText = (brief?.raw_text ?? '').trim();
  }

  if (briefText.length === 0) {
    return { error: 'Ticket has no brief text to classify.' };
  }

  // -- 2. Service-role writes (RLS bypass) — only after auth + ownership ----
  const service = createSupabaseServiceRoleClient();

  // Per-ticket idempotence: refuse to write a second classification event.
  const { data: existing, error: existErr } = await service
    .from('trace_events')
    .select('id')
    .eq('ticket_id', ticket.id)
    .eq('event_type', EVENT_TYPE)
    .limit(1)
    .maybeSingle();
  if (existErr) return { error: existErr.message };
  if (existing) {
    revalidatePath(`/w/${slug}/tickets/${ticket.id}`);
    return { error: null };
  }

  const startedAt = new Date().toISOString();
  const mode = env.MODEL_PROVIDER_MODE;
  const declaredModel = mode === 'anthropic' ? env.ANTHROPIC_CLASSIFY_MODEL : 'dry-run/no-op';

  // -- 3. Workflow run row — starts in `running` state -----------------------
  const { data: run, error: runErr } = await service
    .from('workflow_runs')
    .insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      run_kind: 'orchestrator',
      agent_id: 'central-orchestrator',
      model: declaredModel,
      started_at: startedAt,
      status: 'running',
    })
    .select('id')
    .single();
  if (runErr || !run) return { error: runErr?.message ?? 'Failed to write workflow run.' };

  // -- 4. Next seq ----------------------------------------------------------
  const { data: maxRow, error: seqErr } = await service
    .from('trace_events')
    .select('seq')
    .eq('ticket_id', ticket.id)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (seqErr) return { error: seqErr.message };
  const nextSeq = (maxRow?.seq ?? 0) + 1;

  // -- 5. Real classification call ------------------------------------------
  try {
    const result = await classifyBrief({ rawText: briefText, mode });
    const endedAt = new Date().toISOString();

    // Update run with usage + cost.
    const { error: runUpdErr } = await service
      .from('workflow_runs')
      .update({
        model: result.model,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        cost_usd: result.cost_usd,
        ended_at: endedAt,
        status: 'done',
      })
      .eq('id', run.id);
    if (runUpdErr) return { error: runUpdErr.message };

    const payload = {
      mode: result.mode,
      model: result.model,
      prompt_version: result.prompt_version,
      classification: result.classification,
      verdict: result.verdict,
      reason: result.reason,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      cost_usd: result.cost_usd,
      tool_use: false,
    };

    const { data: event, error: evErr } = await service
      .from('trace_events')
      .insert({
        workspace_id: workspace.id,
        ticket_id: ticket.id,
        seq: nextSeq,
        from_agent: 'user',
        to_agent: 'central-orchestrator',
        event_type: EVENT_TYPE,
        payload,
      })
      .select('id')
      .single();
    if (evErr || !event) return { error: evErr?.message ?? 'Failed to write trace event.' };

    const bodyRaw =
      `HANDOFF PACKET\n` +
      `from: central-orchestrator\n` +
      `to: ${result.classification}-coordinator\n` +
      `classification: ${result.classification}\n` +
      `verdict: ${result.verdict}\n` +
      `model: ${result.model}\n` +
      `prompt_version: ${result.prompt_version}\n` +
      `tool_use: false\n` +
      `reason: ${result.reason}`;

    const { error: pkErr } = await service.from('packets').insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      trace_event_id: event.id,
      packet_type: 'handoff',
      body_raw: bodyRaw,
      body_parsed: {
        ...payload,
        from: 'central-orchestrator',
        to: `${result.classification}-coordinator`,
        packet_kind: 'handoff',
      },
    });
    if (pkErr) return { error: pkErr.message };

    // Ticket transitions to in_progress; coordinator routing lands in T3.
    const { error: updErr } = await service
      .from('tickets')
      .update({
        status: 'in_progress',
        layer: result.classification,
        current_agent: 'central-orchestrator',
      })
      .eq('id', ticket.id);
    if (updErr) return { error: updErr.message };
  } catch (e) {
    const err = e instanceof ModelProviderError
      ? { kind: e.kind, detail: e.message }
      : { kind: 'execution_error' as const, detail: (e as Error).message ?? 'unknown error' };

    const endedAt = new Date().toISOString();
    await service
      .from('workflow_runs')
      .update({ ended_at: endedAt, status: 'failed' })
      .eq('id', run.id);

    const failurePayload = {
      failure_type: err.kind,
      detail: err.detail,
      model: declaredModel,
      prompt_version: CLASSIFY_PROMPT_VERSION,
    };

    const { data: failEvent } = await service
      .from('trace_events')
      .insert({
        workspace_id: workspace.id,
        ticket_id: ticket.id,
        seq: nextSeq,
        from_agent: 'central-orchestrator',
        to_agent: 'user',
        event_type: 'orchestrator.failed',
        payload: failurePayload,
      })
      .select('id')
      .single();

    await service.from('packets').insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      trace_event_id: failEvent?.id ?? null,
      packet_type: 'failure',
      body_raw:
        `FAILURE PACKET\n` +
        `from: central-orchestrator\n` +
        `to: user\n` +
        `failure_type: ${err.kind}\n` +
        `detail: ${err.detail}\n` +
        `model: ${declaredModel}\n` +
        `prompt_version: ${CLASSIFY_PROMPT_VERSION}\n` +
        `recovery_suggestion: retry`,
      body_parsed: {
        ...failurePayload,
        from: 'central-orchestrator',
        to: 'user',
        packet_kind: 'failure',
        recovery_suggestion: 'retry',
      },
    });

    await service
      .from('tickets')
      .update({
        status: 'failed',
        current_agent: 'central-orchestrator',
        failure_type: err.kind,
      })
      .eq('id', ticket.id);

    revalidatePath(`/w/${slug}/tickets/${ticket.id}`);
    return { error: `Classification failed: ${err.detail}` };
  }

  revalidatePath(`/w/${slug}/tickets/${ticket.id}`);
  redirect(`/w/${slug}/tickets/${ticket.id}`);
}

// ---------------------------------------------------------------------------
// Phase 2 T3 — Coordinator + Specialist pass. Deterministic. No model call.
//
// Lifecycle precondition: ticket.status === 'in_progress' and a row exists in
// trace_events with event_type === 'orchestrator.classified' for this ticket.
//
// Writes (atomically from the action's perspective; pgtap covers RLS):
//   - workflow_runs x2 (coordinator + specialist, both deterministic)
//   - trace_events  x2 (coordinator.routed, specialist.artifact.created)
//   - artifacts     x1 (kind='markdown', bytes=len, storage_path null)
//   - packets       x1 (packet_type='artifact', linked to specialist trace)
//   - tickets       set status='done', current_agent='<layer>-specialist'
// ---------------------------------------------------------------------------

const COORDINATOR_EVENT_TYPE = 'coordinator.routed';
const SPECIALIST_EVENT_TYPE = 'specialist.artifact.created';

const LAYER_TO_SPECIALIST: Record<string, string> = {
  build: 'architect',
  research: 'research-analyst',
  operate: 'devops',
  distribution: 'marketing-strategy',
  learning: 'analytics',
};

function deriveTitle(ticketTitle: string, briefText: string): string {
  const t = ticketTitle?.trim();
  if (t && t.length > 0) return t.slice(0, 120);
  const firstLine = briefText.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  return firstLine.trim().slice(0, 120) || 'Untitled brief';
}

function deriveBullets(briefText: string): string[] {
  // Deterministic, no model. Pick up to 5 non-empty lines as anchor bullets.
  const lines = briefText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const picked = lines.slice(0, 5).map((l) => (l.length > 160 ? l.slice(0, 157) + '…' : l));
  if (picked.length === 0) return ['Brief had no readable content.'];
  return picked;
}

function buildArtifactMarkdown(args: {
  title: string;
  layer: string;
  ticketId: string;
  bullets: string[];
}): string {
  return (
    `# ${args.title}\n\n` +
    `- **Classified layer:** ${args.layer}\n` +
    `- **Source ticket:** ${args.ticketId}\n\n` +
    `## Anchor points from the brief\n\n` +
    args.bullets.map((b) => `- ${b}`).join('\n') +
    `\n\n---\n\n` +
    `_Phase 2 T3 deterministic specialist pass. No model call performed for this artifact. ` +
    `Coordinator routing and Specialist artifact creation are evidence-shape plumbing; ` +
    `real model-driven content arrives in later phases._\n`
  );
}

export async function runCoordinatorSpecialistPass(
  _prev: OrchestratorRunState,
  form: FormData,
): Promise<OrchestratorRunState> {
  const slug = String(form.get('slug') ?? '').trim();
  const ticketId = String(form.get('ticketId') ?? '').trim();

  if (!slug || !ticketId) return { error: 'Missing workspace or ticket.' };

  // 1. RLS-gated authorization read.
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: workspace, error: wsErr } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (wsErr) return { error: wsErr.message };
  if (!workspace) return { error: 'Workspace not found or access denied.' };

  const { data: ticket, error: tErr } = await supabase
    .from('tickets')
    .select('id, title, status, layer, workspace_id, brief_id')
    .eq('id', ticketId)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (tErr) return { error: tErr.message };
  if (!ticket) return { error: 'Ticket not found or access denied.' };

  if (ticket.status !== 'in_progress') {
    return { error: `Ticket must be in_progress (currently ${ticket.status}).` };
  }

  // Read classification event via session client (RLS).
  const { data: classifyEvent, error: ceErr } = await supabase
    .from('trace_events')
    .select('id, seq, payload')
    .eq('ticket_id', ticket.id)
    .eq('event_type', EVENT_TYPE)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ceErr) return { error: ceErr.message };
  if (!classifyEvent) {
    return { error: 'Ticket has no orchestrator.classified event; run the Orchestrator first.' };
  }

  const classifiedLayer = (() => {
    const p = classifyEvent.payload as Record<string, unknown> | null;
    const c = p?.classification;
    return typeof c === 'string' ? c : ticket.layer;
  })();
  if (!classifiedLayer || !LAYER_TO_SPECIALIST[classifiedLayer]) {
    return { error: `Unknown classified layer: ${String(classifiedLayer)}` };
  }
  const specialistId = LAYER_TO_SPECIALIST[classifiedLayer];
  const coordinatorId = `${classifiedLayer}-coordinator`;

  // Read brief for artifact content (RLS).
  let briefText = '';
  if (ticket.brief_id) {
    const { data: brief } = await supabase
      .from('briefs')
      .select('raw_text')
      .eq('id', ticket.brief_id)
      .maybeSingle();
    briefText = (brief?.raw_text ?? '').trim();
  }

  // 2. Service-role writes — only after the session-client checks above succeeded.
  const service = createSupabaseServiceRoleClient();

  // Idempotence: refuse to add a second artifact for this ticket.
  const { data: existingArtifact, error: artErr } = await service
    .from('artifacts')
    .select('id')
    .eq('ticket_id', ticket.id)
    .limit(1)
    .maybeSingle();
  if (artErr) return { error: artErr.message };
  if (existingArtifact) {
    revalidatePath(`/w/${slug}/tickets/${ticket.id}`);
    return { error: null };
  }

  // Determine next seq for both events.
  const { data: maxRow, error: seqErr } = await service
    .from('trace_events')
    .select('seq')
    .eq('ticket_id', ticket.id)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (seqErr) return { error: seqErr.message };
  const coordSeq = (maxRow?.seq ?? 0) + 1;
  const specSeq = coordSeq + 1;

  const nowCoord = new Date().toISOString();

  // Coordinator run.
  const { error: coordRunErr } = await service.from('workflow_runs').insert({
    workspace_id: workspace.id,
    ticket_id: ticket.id,
    run_kind: 'coordinator',
    agent_id: coordinatorId,
    model: 'deterministic/t3',
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    started_at: nowCoord,
    ended_at: nowCoord,
    status: 'done',
  });
  if (coordRunErr) return { error: coordRunErr.message };

  const coordPayload = {
    layer: classifiedLayer,
    reason: `Routing to ${specialistId} based on orchestrator classification.`,
    tool_use: false,
    phase: 'phase2_t3',
    classified_event_id: classifyEvent.id,
    ticket_id: ticket.id,
  };

  const { data: coordEvent, error: coordEvErr } = await service
    .from('trace_events')
    .insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      seq: coordSeq,
      from_agent: 'central-orchestrator',
      to_agent: coordinatorId,
      event_type: COORDINATOR_EVENT_TYPE,
      payload: coordPayload,
    })
    .select('id')
    .single();
  if (coordEvErr || !coordEvent) {
    return { error: coordEvErr?.message ?? 'Failed to write coordinator trace event.' };
  }

  // Specialist run + artifact + packet.
  const nowSpec = new Date().toISOString();
  const { error: specRunErr } = await service.from('workflow_runs').insert({
    workspace_id: workspace.id,
    ticket_id: ticket.id,
    run_kind: 'specialist',
    agent_id: specialistId,
    model: 'deterministic/t3',
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    started_at: nowSpec,
    ended_at: nowSpec,
    status: 'done',
  });
  if (specRunErr) return { error: specRunErr.message };

  const artifactTitle = deriveTitle(ticket.title as string, briefText);
  const bullets = deriveBullets(briefText);
  const markdown = buildArtifactMarkdown({
    title: artifactTitle,
    layer: classifiedLayer,
    ticketId: ticket.id as string,
    bullets,
  });
  const byteLen = Buffer.byteLength(markdown, 'utf8');

  const { data: artifactRow, error: artInsErr } = await service
    .from('artifacts')
    .insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      kind: 'markdown',
      storage_path: null,
      mime_type: 'text/markdown',
      bytes: byteLen,
    })
    .select('id')
    .single();
  if (artInsErr || !artifactRow) {
    return { error: artInsErr?.message ?? 'Failed to write artifact row.' };
  }

  const specPayload = {
    artifact_id: artifactRow.id,
    artifact_kind: 'markdown',
    artifact_title: artifactTitle,
    source_trace_event_id: coordEvent.id,
    bytes: byteLen,
    tool_use: false,
    phase: 'phase2_t3',
  };

  const { data: specEvent, error: specEvErr } = await service
    .from('trace_events')
    .insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      seq: specSeq,
      from_agent: specialistId,
      to_agent: 'central-orchestrator',
      event_type: SPECIALIST_EVENT_TYPE,
      payload: specPayload,
    })
    .select('id')
    .single();
  if (specEvErr || !specEvent) {
    return { error: specEvErr?.message ?? 'Failed to write specialist trace event.' };
  }

  const packetBodyRaw =
    `ARTIFACT PACKET\n` +
    `from: ${specialistId}\n` +
    `to: central-orchestrator\n` +
    `artifact_id: ${artifactRow.id}\n` +
    `artifact_kind: markdown\n` +
    `title: ${artifactTitle}\n` +
    `bytes: ${byteLen}\n` +
    `tool_use: false\n` +
    `phase: phase2_t3\n` +
    `---\n` +
    markdown;

  const { error: pkErr } = await service.from('packets').insert({
    workspace_id: workspace.id,
    ticket_id: ticket.id,
    trace_event_id: specEvent.id,
    packet_type: 'artifact',
    body_raw: packetBodyRaw,
    body_parsed: {
      from: specialistId,
      to: 'central-orchestrator',
      packet_kind: 'artifact',
      artifact_id: artifactRow.id,
      artifact_kind: 'markdown',
      title: artifactTitle,
      bytes: byteLen,
      layer: classifiedLayer,
      bullets,
      markdown,
      tool_use: false,
      phase: 'phase2_t3',
    },
  });
  if (pkErr) return { error: pkErr.message };

  // Ticket → done. Layer preserved; current_agent becomes the specialist.
  const { error: updErr } = await service
    .from('tickets')
    .update({
      status: 'done',
      layer: classifiedLayer,
      current_agent: specialistId,
    })
    .eq('id', ticket.id);
  if (updErr) return { error: updErr.message };

  revalidatePath(`/w/${slug}/tickets/${ticket.id}`);
  redirect(`/w/${slug}/tickets/${ticket.id}`);
}

// ---------------------------------------------------------------------------
// Phase 2 T4 — QA + Truth Agent internal evidence pass. Deterministic.
//
// No model call. No external attestation. Purely internal workflow evidence
// over the records produced by T2 (orchestrator) and T3 (coordinator +
// specialist artifact).
//
// Preconditions (verified via session client, RLS-gated):
//   - user session
//   - workspace by slug
//   - ticket by id in workspace
//   - trace_events row of type 'specialist.artifact.created' exists
//   - at least one artifacts row exists for the ticket
//   - no existing trace_events row of type 'qa.validated' for ticket
//   - no existing trace_events row of type 'truth.verdict.recorded'
//
// Writes (service-role, only after RLS auth succeeds):
//   - workflow_runs   x2 (qa, truth) — deterministic, zero tokens/cost
//   - trace_events    x2 (qa.validated, truth.verdict.recorded)
//   - packets         x2 (packet_type='trace' for QA, 'truth' for Truth)
//   - tickets         set/reaffirm status='done' (only after both packets exist)
// ---------------------------------------------------------------------------

const QA_EVENT_TYPE = 'qa.validated';
const TRUTH_EVENT_TYPE = 'truth.verdict.recorded';

export async function runQaTruthReview(
  _prev: OrchestratorRunState,
  form: FormData,
): Promise<OrchestratorRunState> {
  const slug = String(form.get('slug') ?? '').trim();
  const ticketId = String(form.get('ticketId') ?? '').trim();

  if (!slug || !ticketId) return { error: 'Missing workspace or ticket.' };

  // 1. RLS-gated authorization read.
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: workspace, error: wsErr } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (wsErr) return { error: wsErr.message };
  if (!workspace) return { error: 'Workspace not found or access denied.' };

  const { data: ticket, error: tErr } = await supabase
    .from('tickets')
    .select('id, status, layer, workspace_id')
    .eq('id', ticketId)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (tErr) return { error: tErr.message };
  if (!ticket) return { error: 'Ticket not found or access denied.' };

  // Read existing trace events for precondition checks (RLS).
  const { data: events, error: evReadErr } = await supabase
    .from('trace_events')
    .select('id, seq, from_agent, event_type, payload')
    .eq('ticket_id', ticket.id)
    .order('seq', { ascending: true });
  if (evReadErr) return { error: evReadErr.message };

  const eventRows = (events ?? []) as Array<{
    id: number;
    seq: number;
    from_agent: string | null;
    event_type: string;
    payload: Record<string, unknown> | null;
  }>;

  const specialistEvent = eventRows.find((e) => e.event_type === SPECIALIST_EVENT_TYPE);
  if (!specialistEvent) {
    return { error: 'Ticket has no specialist.artifact.created event; run the Specialist pass first.' };
  }

  const hasQa = eventRows.some((e) => e.event_type === QA_EVENT_TYPE);
  const hasTruth = eventRows.some((e) => e.event_type === TRUTH_EVENT_TYPE);
  if (hasQa && hasTruth) {
    revalidatePath(`/w/${slug}/tickets/${ticket.id}`);
    return { error: null };
  }

  // Confirm artifact row exists (RLS).
  const { data: artifactRows, error: artReadErr } = await supabase
    .from('artifacts')
    .select('id, kind, bytes')
    .eq('ticket_id', ticket.id)
    .order('created_at', { ascending: true });
  if (artReadErr) return { error: artReadErr.message };
  const artifacts = (artifactRows ?? []) as Array<{ id: string; kind: string; bytes: number | null }>;
  if (artifacts.length === 0) {
    return { error: 'Ticket has no artifact; nothing to validate.' };
  }
  const artifact = artifacts[0]!;

  // Find linked artifact packet (RLS) for evidence reference.
  const { data: artifactPacketRow } = await supabase
    .from('packets')
    .select('id, body_parsed')
    .eq('ticket_id', ticket.id)
    .eq('packet_type', 'artifact')
    .eq('trace_event_id', specialistEvent.id)
    .maybeSingle();
  const artifactPacketId = (artifactPacketRow?.id as string | undefined) ?? null;

  const specialistAgent =
    typeof specialistEvent.from_agent === 'string' ? specialistEvent.from_agent : 'specialist';

  // 2. Service-role writes — only after RLS-gated checks above succeeded.
  const service = createSupabaseServiceRoleClient();

  // Re-confirm idempotence on service side (cheap insurance against races).
  const { data: existingQaTrace } = await service
    .from('trace_events')
    .select('id')
    .eq('ticket_id', ticket.id)
    .eq('event_type', QA_EVENT_TYPE)
    .limit(1)
    .maybeSingle();
  const { data: existingTruthTrace } = await service
    .from('trace_events')
    .select('id')
    .eq('ticket_id', ticket.id)
    .eq('event_type', TRUTH_EVENT_TYPE)
    .limit(1)
    .maybeSingle();
  if (existingQaTrace && existingTruthTrace) {
    revalidatePath(`/w/${slug}/tickets/${ticket.id}`);
    return { error: null };
  }

  // Next seq.
  const { data: maxRow, error: seqErr } = await service
    .from('trace_events')
    .select('seq')
    .eq('ticket_id', ticket.id)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (seqErr) return { error: seqErr.message };
  const qaSeq = existingQaTrace ? null : (maxRow?.seq ?? 0) + 1;
  const truthSeq = existingTruthTrace
    ? null
    : (qaSeq ?? maxRow?.seq ?? 0) + (existingQaTrace ? 1 : 1);

  // Deterministic QA checks.
  const checks = {
    artifact_row_present: artifacts.length > 0,
    artifact_packet_present: artifactPacketId !== null,
    specialist_trace_present: true,
    coordinator_trace_present: eventRows.some((e) => e.event_type === COORDINATOR_EVENT_TYPE),
    classification_trace_present: eventRows.some((e) => e.event_type === EVENT_TYPE),
    trace_seq_monotonic: eventRows.every((e, i, arr) => i === 0 || e.seq > (arr[i - 1]?.seq ?? 0)),
    no_tool_use: eventRows.every((e) => {
      const tu = (e.payload as Record<string, unknown> | null)?.tool_use;
      return tu === false || tu === undefined;
    }),
  };
  const qaResult = Object.values(checks).every(Boolean) ? 'pass' : 'fail';

  // --- QA workflow run ---
  let qaTraceId: number | null = existingQaTrace?.id ?? null;
  if (!existingQaTrace && qaSeq !== null) {
    const nowQa = new Date().toISOString();
    const { error: qaRunErr } = await service.from('workflow_runs').insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      run_kind: 'qa',
      agent_id: 'qa-agent',
      model: 'deterministic/t4',
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      started_at: nowQa,
      ended_at: nowQa,
      status: 'done',
    });
    if (qaRunErr) return { error: qaRunErr.message };

    const qaPayload = {
      artifact_id: artifact.id,
      artifact_packet_id: artifactPacketId,
      checks,
      result: qaResult,
      tool_use: false,
      phase: 'phase2_t4',
    };

    const { data: qaEvent, error: qaEvErr } = await service
      .from('trace_events')
      .insert({
        workspace_id: workspace.id,
        ticket_id: ticket.id,
        seq: qaSeq,
        from_agent: specialistAgent,
        to_agent: 'qa-agent',
        event_type: QA_EVENT_TYPE,
        payload: qaPayload,
      })
      .select('id')
      .single();
    if (qaEvErr || !qaEvent) {
      return { error: qaEvErr?.message ?? 'Failed to write QA trace event.' };
    }
    qaTraceId = qaEvent.id;

    const qaBodyRaw =
      `QA PACKET\n` +
      `from: qa-agent\n` +
      `to: central-orchestrator\n` +
      `artifact_id: ${artifact.id}\n` +
      `artifact_packet_id: ${artifactPacketId ?? 'null'}\n` +
      `checked: artifact_row_present=${checks.artifact_row_present}, ` +
      `artifact_packet_present=${checks.artifact_packet_present}, ` +
      `specialist_trace_present=${checks.specialist_trace_present}, ` +
      `coordinator_trace_present=${checks.coordinator_trace_present}, ` +
      `classification_trace_present=${checks.classification_trace_present}, ` +
      `trace_seq_monotonic=${checks.trace_seq_monotonic}, ` +
      `no_tool_use=${checks.no_tool_use}\n` +
      `result: ${qaResult}\n` +
      `tool_use: false\n` +
      `external_attestation: false\n` +
      `phase: phase2_t4`;

    const { error: qaPkErr } = await service.from('packets').insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      trace_event_id: qaTraceId,
      packet_type: 'trace',
      body_raw: qaBodyRaw,
      body_parsed: {
        from: 'qa-agent',
        to: 'central-orchestrator',
        packet_kind: 'qa',
        artifact_id: artifact.id,
        artifact_packet_id: artifactPacketId,
        checks,
        result: qaResult,
        tool_use: false,
        external_attestation: false,
        phase: 'phase2_t4',
      },
    });
    if (qaPkErr) return { error: qaPkErr.message };
  }

  // --- Truth workflow run ---
  if (!existingTruthTrace && truthSeq !== null) {
    const nowTruth = new Date().toISOString();
    const { error: trRunErr } = await service.from('workflow_runs').insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      run_kind: 'truth',
      agent_id: 'truth-agent',
      model: 'deterministic/t4',
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      started_at: nowTruth,
      ended_at: nowTruth,
      status: 'done',
    });
    if (trRunErr) return { error: trRunErr.message };

    const { data: qaPacketRow } = await service
      .from('packets')
      .select('id')
      .eq('ticket_id', ticket.id)
      .eq('trace_event_id', qaTraceId)
      .eq('packet_type', 'trace')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const qaPacketId = (qaPacketRow?.id as string | undefined) ?? null;

    const verdict = qaResult === 'pass' ? 'accepted_internal' : 'rejected_internal';
    const rationale =
      qaResult === 'pass'
        ? 'All deterministic evidence checks passed. Internal review only — no external attestation.'
        : 'One or more deterministic evidence checks failed. See QA packet for details.';

    const truthPayload = {
      qa_packet_id: qaPacketId,
      qa_trace_event_id: qaTraceId,
      artifact_packet_id: artifactPacketId,
      artifact_id: artifact.id,
      verdict,
      rationale,
      external_attestation: false,
      tool_use: false,
      phase: 'phase2_t4',
    };

    const { data: trEvent, error: trEvErr } = await service
      .from('trace_events')
      .insert({
        workspace_id: workspace.id,
        ticket_id: ticket.id,
        seq: truthSeq,
        from_agent: 'qa-agent',
        to_agent: 'truth-agent',
        event_type: TRUTH_EVENT_TYPE,
        payload: truthPayload,
      })
      .select('id')
      .single();
    if (trEvErr || !trEvent) {
      return { error: trEvErr?.message ?? 'Failed to write Truth trace event.' };
    }

    const truthBodyRaw =
      `TRUTH PACKET\n` +
      `from: truth-agent\n` +
      `to: central-orchestrator\n` +
      `verdict: ${verdict}\n` +
      `evidence_reviewed: qa_packet=${qaPacketId ?? 'null'}, ` +
      `artifact_packet=${artifactPacketId ?? 'null'}, artifact=${artifact.id}\n` +
      `external_attestation: false\n` +
      `limits: internal deterministic review of recorded evidence only; ` +
      `not a regulator, customer, or third-party attestation.\n` +
      `rationale: ${rationale}\n` +
      `tool_use: false\n` +
      `phase: phase2_t4`;

    const { error: trPkErr } = await service.from('packets').insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      trace_event_id: trEvent.id,
      packet_type: 'truth',
      body_raw: truthBodyRaw,
      body_parsed: {
        from: 'truth-agent',
        to: 'central-orchestrator',
        packet_kind: 'truth',
        verdict,
        rationale,
        qa_packet_id: qaPacketId,
        qa_trace_event_id: qaTraceId,
        artifact_packet_id: artifactPacketId,
        artifact_id: artifact.id,
        external_attestation: false,
        limits:
          'Internal deterministic review of recorded evidence only. Not a regulator, customer, or third-party attestation.',
        tool_use: false,
        phase: 'phase2_t4',
      },
    });
    if (trPkErr) return { error: trPkErr.message };

    if (verdict === 'accepted_internal' && ticket.status !== 'done') {
      const { error: updErr } = await service
        .from('tickets')
        .update({ status: 'done' })
        .eq('id', ticket.id);
      if (updErr) return { error: updErr.message };
    }
  }

  revalidatePath(`/w/${slug}/tickets/${ticket.id}`);
  redirect(`/w/${slug}/tickets/${ticket.id}`);
}
