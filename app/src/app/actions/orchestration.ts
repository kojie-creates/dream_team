'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service';

export type OrchestratorStubState = { error: string | null };

const STUB_EVENT_TYPE = 'orchestrator_stub.classified';

export async function runOrchestratorStub(
  _prev: OrchestratorStubState,
  form: FormData,
): Promise<OrchestratorStubState> {
  const slug = String(form.get('slug') ?? '').trim();
  const ticketId = String(form.get('ticketId') ?? '').trim();

  if (!slug || !ticketId) return { error: 'Missing workspace or ticket.' };

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
    .select('id, status, workspace_id')
    .eq('id', ticketId)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (tErr) return { error: tErr.message };
  if (!ticket) return { error: 'Ticket not found or access denied.' };

  const service = createSupabaseServiceRoleClient();

  const { data: existing, error: existErr } = await service
    .from('trace_events')
    .select('id')
    .eq('ticket_id', ticket.id)
    .eq('event_type', STUB_EVENT_TYPE)
    .limit(1)
    .maybeSingle();
  if (existErr) return { error: existErr.message };

  if (!existing) {
    const now = new Date().toISOString();

    const { data: run, error: runErr } = await service
      .from('workflow_runs')
      .insert({
        workspace_id: workspace.id,
        ticket_id: ticket.id,
        run_kind: 'orchestrator',
        agent_id: 'central-orchestrator',
        model: 'stub',
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        started_at: now,
        ended_at: now,
        status: 'done',
      })
      .select('id')
      .single();
    if (runErr || !run) return { error: runErr?.message ?? 'Failed to write workflow run.' };

    const { data: maxRow, error: seqErr } = await service
      .from('trace_events')
      .select('seq')
      .eq('ticket_id', ticket.id)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (seqErr) return { error: seqErr.message };
    const nextSeq = (maxRow?.seq ?? 0) + 1;

    const stubPayload = {
      stub: true,
      classification: 'build',
      verdict: 'ready_for_coordinator_stub',
      reason: 'Deterministic Phase 1 stub; no model call performed.',
    };

    const { data: event, error: evErr } = await service
      .from('trace_events')
      .insert({
        workspace_id: workspace.id,
        ticket_id: ticket.id,
        seq: nextSeq,
        from_agent: 'user',
        to_agent: 'central-orchestrator',
        event_type: STUB_EVENT_TYPE,
        payload: stubPayload,
      })
      .select('id')
      .single();
    if (evErr || !event) return { error: evErr?.message ?? 'Failed to write trace event.' };

    const { error: pkErr } = await service.from('packets').insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      trace_event_id: event.id,
      packet_type: 'handoff',
      body_raw:
        'STUB HANDOFF PACKET\nfrom: user\nto: central-orchestrator\nclassification: build\nverdict: ready_for_coordinator_stub\nnote: Deterministic Phase 1 stub; no model call performed.',
      body_parsed: {
        ...stubPayload,
        from: 'user',
        to: 'central-orchestrator',
        packet_kind: 'handoff',
      },
    });
    if (pkErr) return { error: pkErr.message };
  }

  const { error: updErr } = await service
    .from('tickets')
    .update({
      status: 'done',
      layer: 'build',
      current_agent: 'central-orchestrator',
    })
    .eq('id', ticket.id);
  if (updErr) return { error: updErr.message };

  revalidatePath(`/w/${slug}/tickets/${ticket.id}`);
  redirect(`/w/${slug}/tickets/${ticket.id}`);
}
