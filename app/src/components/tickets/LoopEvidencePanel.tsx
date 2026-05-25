type LoopFailurePacketRow = {
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
      <span className="text-neutral-200 break-words">{value}</span>
    </div>
  );
}

export function LoopEvidencePanel({
  ticketStatus,
  ticketLoopSignature,
  loopFailurePackets,
  traceEvents,
}: {
  ticketStatus: string;
  ticketLoopSignature: string | null;
  loopFailurePackets: LoopFailurePacketRow[];
  traceEvents: TraceLite[];
}) {
  if (ticketStatus !== 'looped' && !ticketLoopSignature && loopFailurePackets.length === 0) {
    return null;
  }

  const traceLookup = new Map<number, TraceLite>(traceEvents.map((e) => [e.id, e]));
  const iterationEvents = traceEvents.filter((e) => e.event_type === 'loop.iteration.detected');
  const termEvent = traceEvents.find((e) => e.event_type === 'loop.terminated') ?? null;

  return (
    <section
      aria-label="Loop evidence"
      className="space-y-3 rounded-lg border border-violet-900/40 bg-violet-950/10 p-4"
    >
      <header className="space-y-1">
        <h2 className="text-sm font-medium text-violet-100">Loop evidence</h2>
        <p className="text-[11px] text-neutral-400">
          Recorded by the workflow. No recovery action is wired yet — this panel is read-only
          evidence.
        </p>
        <p className="text-[11px] text-neutral-500">
          Ticket status:{' '}
          <span className="font-mono text-violet-200">{ticketStatus}</span>
          {ticketLoopSignature ? (
            <>
              {' · '}loop_signature:{' '}
              <span className="font-mono text-violet-200 break-all">{ticketLoopSignature}</span>
            </>
          ) : null}
        </p>
      </header>

      {iterationEvents.length > 0 || termEvent ? (
        <div className="space-y-1 rounded border border-violet-900/40 bg-neutral-950 p-3 text-[11px] text-neutral-300">
          <p className="text-neutral-400">Loop iteration trace:</p>
          <ul className="space-y-1 font-mono">
            {iterationEvents.map((e) => (
              <li key={e.id} className="text-violet-200">
                #{e.seq} {e.event_type} (state_changed=false)
              </li>
            ))}
            {termEvent ? (
              <li className="text-amber-200">
                #{termEvent.seq} {termEvent.event_type} (failure_type=timeout)
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {loopFailurePackets.length > 0 ? (
        <div className="space-y-2">
          {loopFailurePackets.map((packet) => {
            const parsed = (packet.body_parsed ?? {}) as Record<string, unknown>;
            const failureType = str(parsed.failure_type);
            const detail = str(parsed.detail);
            const stateAt = str(parsed.state_at_failure);
            const recovery = str(parsed.recovery_suggestion);
            const sig = str(parsed.loop_signature);
            const from = str(parsed.from);
            const to = str(parsed.to);
            const linkedTrace = packet.trace_event_id
              ? traceLookup.get(packet.trace_event_id) ?? null
              : null;
            return (
              <article
                key={packet.id}
                className="space-y-2 rounded border border-violet-900/50 bg-violet-950/20 p-3"
              >
                <header className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                  <span className="rounded bg-violet-900/60 px-1.5 py-0.5 font-mono font-medium uppercase tracking-wider text-violet-100">
                    loop failure packet
                  </span>
                  <span className="rounded bg-amber-900/40 px-1.5 py-0.5 font-mono text-amber-200">
                    type: {failureType ?? '—'}
                  </span>
                  <span>controlled_test: true</span>
                  <span className="ml-auto text-neutral-500">{fmtTime(packet.created_at)}</span>
                </header>

                <div className="space-y-1">
                  <FieldRow label="Detail" value={detail} />
                  <FieldRow label="State" value={stateAt} />
                  <FieldRow label="Signature" value={sig} />
                  <FieldRow label="Recovery" value={recovery} />
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
          })}
        </div>
      ) : null}

      <p className="text-[11px] text-neutral-500">
        Controlled loop simulation. Two consecutive iterations with no state change produced a
        timeout failure packet.
      </p>
    </section>
  );
}
