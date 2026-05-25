type FailurePacketRow = {
  id: string;
  trace_event_id: number | null;
  body_parsed: Record<string, unknown> | null;
  body_raw: string | null;
  created_at: string;
};

type RejectedTruthRow = {
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

const KNOWN_FAILURE_TYPES = new Set([
  'input_missing',
  'input_invalid',
  'dependency_unavailable',
  'execution_error',
  'quality_gate_fail',
  'scope_exceeded',
  'timeout',
]);

function FieldRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-[11px] leading-relaxed">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-200 break-words">{value}</span>
    </div>
  );
}

function FailurePacketCard({
  packet,
  traceLookup,
}: {
  packet: FailurePacketRow;
  traceLookup: Map<number, TraceLite>;
}) {
  const parsed = (packet.body_parsed ?? {}) as Record<string, unknown>;
  const failureType = str(parsed.failure_type);
  const detail = str(parsed.detail);
  const recovery = str(parsed.recovery_suggestion);
  const from = str(parsed.from);
  const to = str(parsed.to);
  const linkedTrace = packet.trace_event_id ? traceLookup.get(packet.trace_event_id) ?? null : null;

  const typeKnown = failureType !== null && KNOWN_FAILURE_TYPES.has(failureType);

  return (
    <article className="space-y-2 rounded border border-amber-900/50 bg-amber-950/20 p-3">
      <header className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
        <span className="rounded bg-amber-900/60 px-1.5 py-0.5 font-mono font-medium uppercase tracking-wider text-amber-100">
          failure packet
        </span>
        {failureType ? (
          <span
            className={`rounded px-1.5 py-0.5 font-mono ${
              typeKnown ? 'bg-amber-900/40 text-amber-200' : 'bg-neutral-800 text-neutral-300'
            }`}
            title={typeKnown ? 'Closed failure taxonomy' : 'Unknown failure type — taxonomy mismatch'}
          >
            type: {failureType}
          </span>
        ) : (
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-400">
            type: —
          </span>
        )}
        <span className="ml-auto text-neutral-500">{fmtTime(packet.created_at)}</span>
      </header>

      <div className="space-y-1">
        <FieldRow label="Detail" value={detail ?? '—'} />
        <FieldRow label="Recovery" value={recovery ?? '—'} />
        <FieldRow label="From" value={from} />
        <FieldRow label="To" value={to} />
        {linkedTrace ? (
          <FieldRow
            label="Linked trace"
            value={`#${linkedTrace.seq} ${linkedTrace.event_type}`}
          />
        ) : null}
      </div>

      {packet.body_raw ? (
        <details className="text-[11px] text-neutral-400">
          <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">
            packet body
          </summary>
          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-900 p-2 font-mono text-[11px] text-neutral-300">
            {packet.body_raw}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

function RejectedTruthCard({
  packet,
  traceLookup,
}: {
  packet: RejectedTruthRow;
  traceLookup: Map<number, TraceLite>;
}) {
  const parsed = (packet.body_parsed ?? {}) as Record<string, unknown>;
  const verdict = str(parsed.verdict) ?? 'rejected_internal';
  const rationale = str(parsed.rationale);
  const limits = str(parsed.limits);
  const from = str(parsed.from);
  const to = str(parsed.to);
  const linkedTrace = packet.trace_event_id ? traceLookup.get(packet.trace_event_id) ?? null : null;

  return (
    <article className="space-y-2 rounded border border-fuchsia-900/50 bg-fuchsia-950/20 p-3">
      <header className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
        <span className="rounded bg-fuchsia-900/60 px-1.5 py-0.5 font-mono font-medium uppercase tracking-wider text-fuchsia-100">
          rejected internal review
        </span>
        <span className="rounded bg-fuchsia-900/40 px-1.5 py-0.5 font-mono text-fuchsia-200">
          verdict: {verdict}
        </span>
        <span>external_attestation: false</span>
        <span className="ml-auto text-neutral-500">{fmtTime(packet.created_at)}</span>
      </header>

      <div className="space-y-1">
        <FieldRow label="Rationale" value={rationale} />
        <FieldRow label="Limits" value={limits} />
        <FieldRow label="From" value={from} />
        <FieldRow label="To" value={to} />
        {linkedTrace ? (
          <FieldRow
            label="Linked trace"
            value={`#${linkedTrace.seq} ${linkedTrace.event_type}`}
          />
        ) : null}
      </div>

      <p className="text-[11px] text-neutral-500">
        Result of deterministic internal review only. No external attestation.
      </p>

      {packet.body_raw ? (
        <details className="text-[11px] text-neutral-400">
          <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">
            packet body
          </summary>
          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-900 p-2 font-mono text-[11px] text-neutral-300">
            {packet.body_raw}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

export function FailureEvidencePanel({
  ticketStatus,
  ticketFailureType,
  failurePackets,
  rejectedTruthPackets,
  traceEvents,
}: {
  ticketStatus: string;
  ticketFailureType: string | null;
  failurePackets: FailurePacketRow[];
  rejectedTruthPackets: RejectedTruthRow[];
  traceEvents: TraceLite[];
}) {
  if (
    ticketStatus !== 'failed' &&
    failurePackets.length === 0 &&
    rejectedTruthPackets.length === 0
  ) {
    return null;
  }

  const traceLookup = new Map<number, TraceLite>(traceEvents.map((e) => [e.id, e]));

  return (
    <section
      aria-label="Failure evidence"
      className="space-y-3 rounded-lg border border-amber-900/40 bg-amber-950/10 p-4"
    >
      <header className="space-y-1">
        <h2 className="text-sm font-medium text-amber-100">Failure evidence</h2>
        <p className="text-[11px] text-neutral-400">
          Recorded by the workflow. No recovery action is wired yet — this panel is read-only
          evidence.
        </p>
        {ticketStatus === 'failed' ? (
          <p className="text-[11px] text-neutral-500">
            Ticket status:{' '}
            <span className="font-mono text-amber-200">failed</span>
            {ticketFailureType ? (
              <>
                {' · '}failure_type:{' '}
                <span className="font-mono text-amber-200">{ticketFailureType}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      {failurePackets.length > 0 ? (
        <div className="space-y-2">
          {failurePackets.map((p) => (
            <FailurePacketCard key={p.id} packet={p} traceLookup={traceLookup} />
          ))}
        </div>
      ) : ticketStatus === 'failed' ? (
        <p className="rounded border border-dashed border-amber-900/40 bg-neutral-950 p-3 text-[11px] text-neutral-400">
          Ticket marked failed but no failure packet rows are recorded for this ticket. Check the
          trace section below for `orchestrator.failed` or similar events.
        </p>
      ) : null}

      {rejectedTruthPackets.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-wider text-neutral-500">
            Rejected internal review
          </h3>
          {rejectedTruthPackets.map((p) => (
            <RejectedTruthCard key={p.id} packet={p} traceLookup={traceLookup} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
