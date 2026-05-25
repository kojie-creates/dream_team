import { NeedsInputResponseForm } from './NeedsInputResponseForm';

type NeedsInputPacketRow = {
  id: string;
  trace_event_id: number | null;
  body_parsed: Record<string, unknown> | null;
  body_raw: string | null;
  created_at: string;
};

type TraceLite = {
  id: number;
  seq: number;
  event_type: string;
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function FieldRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-[11px] leading-relaxed">
      <span className="text-neutral-500">{label}</span>
      <span className="whitespace-pre-wrap break-words text-neutral-200">{value}</span>
    </div>
  );
}

export function NeedsInputPanel({
  slug,
  ticketId,
  ticketStatus,
  questionPackets,
  responsePackets,
  traceEvents,
}: {
  slug: string;
  ticketId: string;
  ticketStatus: string;
  questionPackets: NeedsInputPacketRow[];
  responsePackets: NeedsInputPacketRow[];
  traceEvents: TraceLite[];
}) {
  if (
    ticketStatus !== 'needs_input' &&
    questionPackets.length === 0 &&
    responsePackets.length === 0
  ) {
    return null;
  }

  const answeredQuestionIds = new Set(
    responsePackets
      .map((p) => (p.body_parsed as Record<string, unknown> | null)?.question_packet_id)
      .filter((v): v is string => typeof v === 'string'),
  );

  const traceLookup = new Map<number, TraceLite>(traceEvents.map((e) => [e.id, e]));

  // Sort packets by created_at ascending so the oldest renders first.
  const sortedQuestions = [...questionPackets].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const sortedResponses = [...responsePackets].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  const hasUnresolved = sortedQuestions.some((q) => !answeredQuestionIds.has(q.id));

  return (
    <section
      aria-label="Needs input"
      className="space-y-3 rounded-lg border border-sky-900/40 bg-sky-950/10 p-4"
    >
      <header className="space-y-1">
        <h2 className="text-sm font-medium text-sky-100">Needs input</h2>
        <p className="text-[11px] text-neutral-400">
          The workflow paused and asked for a structured human answer. Append-only evidence; the
          original question packet is never updated. Resolution is recorded by a linked response
          packet. Recovery/retry continuation lands in Phase 4 T5.
        </p>
      </header>

      {sortedQuestions.map((q) => {
        const parsed = (q.body_parsed ?? {}) as Record<string, unknown>;
        const question = str(parsed.question);
        const reason = str(parsed.reason);
        const linkedTrace = q.trace_event_id ? traceLookup.get(q.trace_event_id) ?? null : null;
        const answered = answeredQuestionIds.has(q.id);
        const matchingResponse = sortedResponses.find(
          (r) =>
            (r.body_parsed as Record<string, unknown> | null)?.question_packet_id === q.id,
        );

        return (
          <article
            key={q.id}
            className="space-y-2 rounded border border-sky-900/50 bg-sky-950/20 p-3"
          >
            <header className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
              <span className="rounded bg-sky-900/60 px-1.5 py-0.5 font-mono font-medium uppercase tracking-wider text-sky-100">
                question
              </span>
              <span
                className={`rounded px-1.5 py-0.5 font-mono ${
                  answered ? 'bg-emerald-900/40 text-emerald-200' : 'bg-amber-900/40 text-amber-200'
                }`}
              >
                {answered ? 'resolved' : 'unresolved'}
              </span>
              <span className="ml-auto text-neutral-500">{fmtTime(q.created_at)}</span>
            </header>

            <div className="space-y-1">
              <FieldRow label="Question" value={question} />
              <FieldRow label="Reason" value={reason} />
              {linkedTrace ? (
                <FieldRow
                  label="Linked trace"
                  value={`#${linkedTrace.seq} ${linkedTrace.event_type}`}
                />
              ) : null}
            </div>

            {matchingResponse ? (
              <RenderResponse packet={matchingResponse} traceLookup={traceLookup} />
            ) : null}

            {q.body_raw ? (
              <details className="text-[11px] text-neutral-400">
                <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">
                  question packet body
                </summary>
                <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-900 p-2 font-mono text-[11px] text-neutral-300">
                  {q.body_raw}
                </pre>
              </details>
            ) : null}
          </article>
        );
      })}

      {ticketStatus === 'needs_input' && hasUnresolved ? (
        <div className="space-y-2 rounded border border-sky-900/40 bg-neutral-950 p-3">
          <h3 className="text-[11px] uppercase tracking-wider text-neutral-400">
            Respond
          </h3>
          <NeedsInputResponseForm slug={slug} ticketId={ticketId} />
        </div>
      ) : null}
    </section>
  );
}

function RenderResponse({
  packet,
  traceLookup,
}: {
  packet: NeedsInputPacketRow;
  traceLookup: Map<number, TraceLite>;
}) {
  const parsed = (packet.body_parsed ?? {}) as Record<string, unknown>;
  const response = str(parsed.response);
  const linkedTrace = packet.trace_event_id ? traceLookup.get(packet.trace_event_id) ?? null : null;
  return (
    <div className="space-y-1 rounded border border-emerald-900/40 bg-emerald-950/20 p-2">
      <header className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
        <span className="rounded bg-emerald-900/60 px-1.5 py-0.5 font-mono font-medium uppercase tracking-wider text-emerald-100">
          response
        </span>
        <span className="ml-auto text-neutral-500">{fmtTime(packet.created_at)}</span>
      </header>
      <FieldRow label="Response" value={response} />
      {linkedTrace ? (
        <FieldRow
          label="Linked trace"
          value={`#${linkedTrace.seq} ${linkedTrace.event_type}`}
        />
      ) : null}
      {packet.body_raw ? (
        <details className="text-[11px] text-neutral-400">
          <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">
            response packet body
          </summary>
          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-900 p-2 font-mono text-[11px] text-neutral-300">
            {packet.body_raw}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
