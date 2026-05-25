import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RunOrchestratorStubButton } from '@/components/tickets/RunOrchestratorStubButton';
import { RunSpecialistPassButton } from '@/components/tickets/RunSpecialistPassButton';
import { RunQaTruthReviewButton } from '@/components/tickets/RunQaTruthReviewButton';
import { InjectControlledFailureButton } from '@/components/tickets/InjectControlledFailureButton';
import { InjectControlledLoopButton } from '@/components/tickets/InjectControlledLoopButton';
import { RequestNeedsInputButton } from '@/components/tickets/RequestNeedsInputButton';
import {
  HoldLoopedTicketAction,
  ReopenFailedTicketAction,
} from '@/components/tickets/RecoveryActions';
import { StatusPill } from '@/components/tickets/StatusPill';
import { TicketProgressStrip } from '@/components/tickets/TicketProgressStrip';
import { TicketAutoRefresh } from '@/components/tickets/TicketAutoRefresh';
import { FailureEvidencePanel } from '@/components/tickets/FailureEvidencePanel';
import { LoopEvidencePanel } from '@/components/tickets/LoopEvidencePanel';
import { NeedsInputPanel } from '@/components/tickets/NeedsInputPanel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type TraceRow = {
  id: number;
  seq: number;
  from_agent: string | null;
  to_agent: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type PacketRow = {
  id: string;
  trace_event_id: number | null;
  packet_type: string;
  body_parsed: Record<string, unknown> | null;
  body_raw: string | null;
  created_at: string;
};

type ArtifactRow = {
  id: string;
  kind: string;
  mime_type: string | null;
  bytes: number | null;
  created_at: string;
};

function payloadSummary(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const keys = ['classification', 'verdict', 'reason'] as const;
  const parts: string[] = [];
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === 'string' && v.length > 0) parts.push(`${k}: ${v}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ slug: string; ticketId: string }>;
}) {
  const { slug, ticketId } = await params;
  if (!UUID_RE.test(ticketId)) notFound();

  const supabase = await createSupabaseServerClient();

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, title, status, layer, current_agent, failure_type, loop_signature, created_at, brief_id')
    .eq('id', ticketId)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (!ticket) notFound();

  let briefText: string | null = null;
  let briefMeta: { source: string; word_count: number; created_at: string } | null = null;
  if (ticket.brief_id) {
    const { data: brief } = await supabase
      .from('briefs')
      .select('raw_text, source, word_count, created_at')
      .eq('id', ticket.brief_id)
      .maybeSingle();
    briefText = brief?.raw_text ?? null;
    if (brief) {
      briefMeta = {
        source: brief.source as string,
        word_count: brief.word_count as number,
        created_at: brief.created_at as string,
      };
    }
  }

  const preview = briefText ? briefText.slice(0, 1200) : null;
  const truncated = briefText ? briefText.length > 1200 : false;

  const { data: traceData } = await supabase
    .from('trace_events')
    .select('id, seq, from_agent, to_agent, event_type, payload, created_at')
    .eq('ticket_id', ticket.id)
    .order('seq', { ascending: true });
  const traceEvents: TraceRow[] = (traceData ?? []) as TraceRow[];

  const { data: packetData } = await supabase
    .from('packets')
    .select('id, trace_event_id, packet_type, body_parsed, body_raw, created_at')
    .eq('ticket_id', ticket.id)
    .order('created_at', { ascending: true });
  const packets: PacketRow[] = (packetData ?? []) as PacketRow[];

  const { data: artifactData } = await supabase
    .from('artifacts')
    .select('id, kind, mime_type, bytes, created_at')
    .eq('ticket_id', ticket.id)
    .order('created_at', { ascending: true });
  const artifacts: ArtifactRow[] = (artifactData ?? []) as ArtifactRow[];

  const hasClassifiedEvent = traceEvents.some((e) => e.event_type === 'orchestrator.classified');
  const hasCoordinatorEvent = traceEvents.some((e) => e.event_type === 'coordinator.routed');
  const hasSpecialistEvent = traceEvents.some((e) => e.event_type === 'specialist.artifact.created');
  const hasQaEvent = traceEvents.some((e) => e.event_type === 'qa.validated');
  const hasTruthEvent = traceEvents.some((e) => e.event_type === 'truth.verdict.recorded');

  const lastEventIso =
    traceEvents.length > 0 ? traceEvents[traceEvents.length - 1]!.created_at : null;
  const lastArtifactIso =
    artifacts.length > 0 ? artifacts[artifacts.length - 1]!.created_at : null;
  const lastUpdatedIso = [lastEventIso, lastArtifactIso, ticket.created_at]
    .filter((x): x is string => typeof x === 'string')
    .sort()
    .pop() ?? null;
  const chainComplete = hasTruthEvent && hasQaEvent && hasSpecialistEvent;
  const shouldPoll = !chainComplete;
  const canRunStub = ticket.status === 'open';
  const canRunSpecialistPass =
    ticket.status === 'in_progress' && hasClassifiedEvent && artifacts.length === 0;
  const canRunQaTruth =
    (ticket.status === 'in_progress' || ticket.status === 'done') &&
    hasSpecialistEvent &&
    artifacts.length > 0 &&
    !(hasQaEvent && hasTruthEvent);
  const canInjectFailure =
    (ticket.status === 'open' || ticket.status === 'in_progress') &&
    !packets.some((p) => p.packet_type === 'failure');
  const canInjectLoop =
    (ticket.status === 'open' || ticket.status === 'in_progress') &&
    !ticket.loop_signature &&
    !packets.some((p) => p.packet_type === 'failure');

  const needsInputQuestionPackets = packets.filter(
    (p) =>
      p.packet_type === 'trace' &&
      (p.body_parsed as Record<string, unknown> | null)?.packet_kind === 'needs_input',
  );
  const needsInputResponsePackets = packets.filter(
    (p) =>
      p.packet_type === 'trace' &&
      (p.body_parsed as Record<string, unknown> | null)?.packet_kind === 'input_response',
  );
  const answeredQuestionIds = new Set(
    needsInputResponsePackets
      .map((p) => (p.body_parsed as Record<string, unknown> | null)?.question_packet_id)
      .filter((v): v is string => typeof v === 'string'),
  );
  const hasUnresolvedNeedsInput = needsInputQuestionPackets.some(
    (q) => !answeredQuestionIds.has(q.id),
  );
  const canRequestNeedsInput =
    (ticket.status === 'open' || ticket.status === 'in_progress') &&
    !hasUnresolvedNeedsInput;

  const canReopenFailed =
    ticket.status === 'failed' && packets.some((p) => p.packet_type === 'failure');
  const canHoldLooped =
    ticket.status === 'looped' && typeof ticket.loop_signature === 'string';
  const hasAnyPhase4Action =
    canInjectFailure ||
    canInjectLoop ||
    canRequestNeedsInput ||
    canReopenFailed ||
    canHoldLooped;

  const artifactPackets = packets.filter((p) => p.packet_type === 'artifact');
  const qaPackets = packets.filter(
    (p) =>
      p.packet_type === 'trace' &&
      (p.body_parsed as Record<string, unknown> | null)?.packet_kind === 'qa',
  );
  const truthPackets = packets.filter((p) => p.packet_type === 'truth');
  const failurePackets = packets.filter((p) => p.packet_type === 'failure');
  const loopFailurePackets = failurePackets.filter(
    (p) =>
      typeof (p.body_parsed as Record<string, unknown> | null)?.loop_signature === 'string',
  );
  const nonLoopFailurePackets = failurePackets.filter(
    (p) =>
      typeof (p.body_parsed as Record<string, unknown> | null)?.loop_signature !== 'string',
  );
  const rejectedTruthPackets = truthPackets.filter(
    (p) => (p.body_parsed as Record<string, unknown> | null)?.verdict === 'rejected_internal',
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          <Link href={`/w/${workspace.slug}`} className="hover:text-neutral-300">
            {workspace.name}
          </Link>
          {' · '}
          <Link href={`/w/${workspace.slug}/tickets`} className="hover:text-neutral-300">
            Tickets
          </Link>
          {' · '}Ticket
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">{ticket.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          <StatusPill status={ticket.status} />
          {ticket.failure_type ? (
            <span className="rounded bg-amber-900/40 px-1.5 py-0.5 font-mono text-[11px] text-amber-200">
              failure_type: {ticket.failure_type}
            </span>
          ) : null}
          {ticket.loop_signature ? (
            <span
              className="rounded bg-violet-900/40 px-1.5 py-0.5 font-mono text-[11px] text-violet-200"
              title={ticket.loop_signature as string}
            >
              loop_signature: {(ticket.loop_signature as string).slice(0, 48)}
              {(ticket.loop_signature as string).length > 48 ? '…' : ''}
            </span>
          ) : null}
          {ticket.layer ? <span>Layer: {ticket.layer}</span> : null}
          {ticket.current_agent ? <span>Agent: {ticket.current_agent}</span> : null}
          <span>Opened {new Date(ticket.created_at).toLocaleString()}</span>
        </div>
        {briefMeta ? (
          <p className="text-[11px] text-neutral-500">
            From brief · <span className="font-mono text-neutral-400">{briefMeta.source}</span> ·{' '}
            {briefMeta.word_count} words · {fmtShortDate(briefMeta.created_at)}
          </p>
        ) : null}
      </header>

      <NeedsInputPanel
        slug={workspace.slug}
        ticketId={ticket.id as string}
        ticketStatus={ticket.status as string}
        questionPackets={needsInputQuestionPackets.map((p) => ({
          id: p.id,
          trace_event_id: p.trace_event_id,
          body_parsed: p.body_parsed,
          body_raw: p.body_raw,
          created_at: p.created_at,
        }))}
        responsePackets={needsInputResponsePackets.map((p) => ({
          id: p.id,
          trace_event_id: p.trace_event_id,
          body_parsed: p.body_parsed,
          body_raw: p.body_raw,
          created_at: p.created_at,
        }))}
        traceEvents={traceEvents.map((e) => ({
          id: e.id,
          seq: e.seq,
          event_type: e.event_type,
        }))}
      />

      <LoopEvidencePanel
        ticketStatus={ticket.status as string}
        ticketLoopSignature={(ticket.loop_signature as string | null) ?? null}
        loopFailurePackets={loopFailurePackets.map((p) => ({
          id: p.id,
          trace_event_id: p.trace_event_id,
          body_parsed: p.body_parsed,
          body_raw: p.body_raw,
          created_at: p.created_at,
        }))}
        traceEvents={traceEvents.map((e) => ({
          id: e.id,
          seq: e.seq,
          event_type: e.event_type,
        }))}
      />

      <FailureEvidencePanel
        ticketStatus={ticket.status as string}
        ticketFailureType={(ticket.failure_type as string | null) ?? null}
        failurePackets={nonLoopFailurePackets.map((p) => ({
          id: p.id,
          trace_event_id: p.trace_event_id,
          body_parsed: p.body_parsed,
          body_raw: p.body_raw,
          created_at: p.created_at,
        }))}
        rejectedTruthPackets={rejectedTruthPackets.map((p) => ({
          id: p.id,
          trace_event_id: p.trace_event_id,
          body_parsed: p.body_parsed,
          body_raw: p.body_raw,
          created_at: p.created_at,
        }))}
        traceEvents={traceEvents.map((e) => ({
          id: e.id,
          seq: e.seq,
          event_type: e.event_type,
        }))}
      />

      <TicketProgressStrip
        input={{
          hasBrief: briefText !== null && briefText.length > 0,
          hasClassifiedEvent,
          hasCoordinatorEvent,
          hasSpecialistEvent,
          hasArtifact: artifacts.length > 0,
          hasQaEvent,
          hasTruthEvent,
        }}
      />

      <TicketAutoRefresh polling={shouldPoll} lastUpdatedIso={lastUpdatedIso} />

      {canRunStub ? (
        <section className="space-y-2 rounded border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="text-sm font-medium text-neutral-200">Orchestrator</h2>
          <RunOrchestratorStubButton slug={workspace.slug} ticketId={ticket.id} />
        </section>
      ) : null}

      {canRunSpecialistPass ? (
        <section className="space-y-2 rounded border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="text-sm font-medium text-neutral-200">Coordinator + Specialist</h2>
          <RunSpecialistPassButton slug={workspace.slug} ticketId={ticket.id} />
        </section>
      ) : null}

      {canRunQaTruth ? (
        <section className="space-y-2 rounded border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="text-sm font-medium text-neutral-200">QA + Truth Review</h2>
          <RunQaTruthReviewButton slug={workspace.slug} ticketId={ticket.id} />
        </section>
      ) : null}

      {hasAnyPhase4Action ? (
        <details className="rounded border border-neutral-800 bg-neutral-950 p-4">
          <summary className="cursor-pointer text-sm font-medium text-neutral-200">
            Phase 4 inspector / test controls
          </summary>
          <p className="mt-2 text-[11px] text-neutral-500">
            Controlled state-management actions. No model calls. All evidence is preserved
            (append-only). Only eligible actions appear.
          </p>
          <div className="mt-3 space-y-3">
            {canReopenFailed ? (
              <ReopenFailedTicketAction slug={workspace.slug} ticketId={ticket.id} />
            ) : null}
            {canHoldLooped ? (
              <HoldLoopedTicketAction slug={workspace.slug} ticketId={ticket.id} />
            ) : null}
            {canInjectFailure ? (
              <div className="space-y-2 rounded border border-amber-900/40 bg-amber-950/10 p-3">
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-amber-100">
                  Failure test
                </h3>
                <p className="text-[11px] text-neutral-400">
                  Create a controlled failure packet for this ticket. Demo/test action.
                </p>
                <InjectControlledFailureButton slug={workspace.slug} ticketId={ticket.id} />
              </div>
            ) : null}
            {canInjectLoop ? (
              <div className="space-y-2 rounded border border-violet-900/40 bg-violet-950/10 p-3">
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-violet-100">
                  Loop test
                </h3>
                <p className="text-[11px] text-neutral-400">
                  Create a controlled loop signature for this ticket. Demo/test action.
                </p>
                <InjectControlledLoopButton slug={workspace.slug} ticketId={ticket.id} />
              </div>
            ) : null}
            {canRequestNeedsInput ? (
              <div className="space-y-2 rounded border border-sky-900/40 bg-sky-950/10 p-3">
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-sky-100">
                  Needs input test
                </h3>
                <p className="text-[11px] text-neutral-400">
                  Pause the workflow and ask for one structured human answer. Demo/test action.
                  Continuation back to in_progress lands in the T4 response flow.
                </p>
                <RequestNeedsInputButton slug={workspace.slug} ticketId={ticket.id} />
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-200">Source brief</h2>
        {preview ? (
          <pre className="whitespace-pre-wrap rounded border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs leading-relaxed text-neutral-200">
            {preview}
            {truncated ? '\n…' : ''}
          </pre>
        ) : (
          <p className="rounded border border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-500">
            No brief attached to this ticket.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-200">Trace</h2>
        {traceEvents.length === 0 ? (
          <p className="rounded border border-dashed border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-500">
            Trace events will appear after the Orchestrator runs.
          </p>
        ) : (
          <ol className="space-y-2">
            {traceEvents.map((ev) => {
              const summary = payloadSummary(ev.payload);
              const evPackets = packets.filter((p) => p.trace_event_id === ev.id);
              return (
                <li
                  key={ev.id}
                  className="space-y-1 rounded border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-200">
                      #{ev.seq}
                    </span>
                    <span className="font-mono text-neutral-200">{ev.event_type}</span>
                    <span>{ev.from_agent ?? '—'} → {ev.to_agent ?? '—'}</span>
                    <span className="ml-auto text-neutral-500">
                      {new Date(ev.created_at).toLocaleString()}
                    </span>
                  </div>
                  {summary ? (
                    <p className="text-neutral-300">{summary}</p>
                  ) : ev.payload && Object.keys(ev.payload).length > 0 ? (
                    <details className="text-[11px] text-neutral-400">
                      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">payload</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-neutral-900 p-2 font-mono text-[11px] text-neutral-300">
                        {JSON.stringify(ev.payload, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                  {evPackets.length > 0 ? (
                    <ul className="space-y-1 border-t border-neutral-800 pt-1">
                      {evPackets.map((p) => (
                        <li key={p.id} className="text-[11px] text-neutral-400">
                          <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-200">
                            packet:{p.packet_type}
                          </span>{' '}
                          {payloadSummary(p.body_parsed) ?? 'no summary'}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {artifacts.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-200">Artifacts</h2>
          <p className="text-[11px] text-neutral-500">
            Artifact body is the linked packet content stored in the database. No external file is uploaded
            or downloaded; there is nothing to download.
          </p>
          <ul className="space-y-2">
            {artifacts.map((a) => {
              const linkedPacket = artifactPackets.find(
                (p) => (p.body_parsed as Record<string, unknown> | null)?.artifact_id === a.id,
              );
              const parsed = (linkedPacket?.body_parsed ?? null) as Record<string, unknown> | null;
              const title = typeof parsed?.title === 'string' ? parsed.title : null;
              const markdown =
                typeof parsed?.markdown === 'string'
                  ? parsed.markdown
                  : linkedPacket?.body_raw ?? null;
              const lineCount = markdown ? markdown.split(/\r?\n/).length : 0;
              return (
                <li
                  key={a.id}
                  className="space-y-2 rounded border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-200">
                      kind: {a.kind}
                    </span>
                    {a.mime_type ? (
                      <span className="font-mono">type: {a.mime_type}</span>
                    ) : null}
                    {a.bytes != null ? <span>{a.bytes.toLocaleString()} bytes</span> : null}
                    {markdown ? <span>{lineCount} lines</span> : null}
                    <span className="ml-auto text-neutral-500">
                      created {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                  {title ? <p className="font-medium text-neutral-200">{title}</p> : null}
                  {markdown ? (
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-neutral-900 p-2 font-mono text-[11px] leading-relaxed text-neutral-200">
                      {markdown}
                    </pre>
                  ) : (
                    <p className="text-[11px] text-neutral-500">
                      No body packet linked. Artifact metadata only.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {qaPackets.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-200">QA evidence</h2>
          <ul className="space-y-2">
            {qaPackets.map((p) => {
              const parsed = (p.body_parsed ?? {}) as Record<string, unknown>;
              const result = typeof parsed.result === 'string' ? parsed.result : '—';
              const checks = (parsed.checks ?? {}) as Record<string, boolean>;
              return (
                <li
                  key={p.id}
                  className="space-y-2 rounded border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-200">
                      qa-agent
                    </span>
                    <span>result: {result}</span>
                    <span>external_attestation: false</span>
                    <span className="ml-auto text-neutral-500">
                      {new Date(p.created_at).toLocaleString()}
                    </span>
                  </div>
                  <ul className="grid grid-cols-1 gap-1 text-[11px] text-neutral-400 sm:grid-cols-2">
                    {Object.entries(checks).map(([k, v]) => (
                      <li key={k} className="font-mono">
                        {v ? '✓' : '✗'} {k}
                      </li>
                    ))}
                  </ul>
                  {p.body_raw ? (
                    <details className="text-[11px] text-neutral-400">
                      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">
                        packet body
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-neutral-900 p-2 font-mono text-[11px] text-neutral-300">
                        {p.body_raw}
                      </pre>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {truthPackets.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-200">Truth evidence</h2>
          <ul className="space-y-2">
            {truthPackets.map((p) => {
              const parsed = (p.body_parsed ?? {}) as Record<string, unknown>;
              const verdict = typeof parsed.verdict === 'string' ? parsed.verdict : '—';
              const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : null;
              const limits = typeof parsed.limits === 'string' ? parsed.limits : null;
              return (
                <li
                  key={p.id}
                  className="space-y-2 rounded border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-200">
                      truth-agent
                    </span>
                    <span>verdict: {verdict}</span>
                    <span>external_attestation: false</span>
                    <span className="ml-auto text-neutral-500">
                      {new Date(p.created_at).toLocaleString()}
                    </span>
                  </div>
                  {rationale ? <p className="text-neutral-300">{rationale}</p> : null}
                  {limits ? (
                    <p className="text-[11px] text-neutral-500">Limits: {limits}</p>
                  ) : null}
                  {p.body_raw ? (
                    <details className="text-[11px] text-neutral-400">
                      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">
                        packet body
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-neutral-900 p-2 font-mono text-[11px] text-neutral-300">
                        {p.body_raw}
                      </pre>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {packets.some((p) => p.trace_event_id === null) ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-200">Unlinked packets</h2>
          <ul className="space-y-1">
            {packets
              .filter((p) => p.trace_event_id === null)
              .map((p) => (
                <li
                  key={p.id}
                  className="rounded border border-neutral-800 bg-neutral-950 p-2 text-[11px] text-neutral-400"
                >
                  <span className="font-mono text-neutral-200">{p.packet_type}</span>{' '}
                  {payloadSummary(p.body_parsed) ?? 'no summary'}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-4 text-xs text-neutral-500">
        <Link
          href={`/w/${workspace.slug}/tickets`}
          className="hover:text-neutral-300"
        >
          ← Back to tickets
        </Link>
        <Link
          href={`/w/${workspace.slug}`}
          className="hover:text-neutral-300"
        >
          ← Back to {workspace.name}
        </Link>
      </div>
    </div>
  );
}
