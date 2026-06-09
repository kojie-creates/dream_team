import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTicket, listTrace, listArtifacts, type Ticket, type TraceEvent, type Artifact } from '../lib/db.ts';
import { StatusPill, Card, Spinner, ErrorNote, relTime } from '../components/ui.tsx';

/** Compact one-line summary of a trace event payload (tool.executed etc.). */
function summarize(e: TraceEvent): string {
  const p = e.payload ?? {};
  const tool = p.tool_name as string | undefined;
  if (tool) {
    const decision = (p.gate_decision ?? p.verdict) as string | undefined;
    const cap = p.capability as string | undefined;
    return `${tool}${cap ? ` (${cap})` : ''}${decision ? ` → ${decision}` : ''}`;
  }
  if (p.cause) return `halt: ${String(p.cause)}`;
  return e.event_type;
}

function decisionColor(e: TraceEvent): string {
  const d = (e.payload?.gate_decision ?? e.payload?.verdict) as string | undefined;
  if (d === 'permit' || d === 'pass') return 'text-green-700';
  if (d && d.startsWith('blocked')) return 'text-red-700';
  if (e.event_type === 'run.halted') return 'text-red-700';
  return 'text-gray-600';
}

export function TicketDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    const load = async () => {
      try {
        const [t, tr, ar] = await Promise.all([getTicket(id), listTrace(id), listArtifacts(id)]);
        if (!live) return;
        setTicket(t);
        setTrace(tr);
        setArtifacts(ar);
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const iv = setInterval(load, 3000); // poll; Realtime replaces in B4
    return () => { live = false; clearInterval(iv); };
  }, [id]);

  const toolCount = trace.filter((e) => e.event_type === 'tool.executed').length;

  return (
    <div className="space-y-4">
      <Link to="/tickets" className="text-sm text-gray-500 underline">← Tickets</Link>
      {err && <ErrorNote>{err}</ErrorNote>}

      {!ticket ? (
        <Spinner />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-ink">{ticket.title ?? '(untitled)'}</h1>
            <StatusPill status={ticket.status} />
          </div>
          <div className="text-xs text-gray-500">
            {ticket.layer && <>layer {ticket.layer} · </>}
            {ticket.current_agent && <>agent {ticket.current_agent} · </>}
            created {relTime(ticket.created_at)} · {toolCount} tool action(s)
          </div>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink">Trace</h2>
            {trace.length === 0 ? (
              <p className="text-sm text-gray-500">No trace events yet.</p>
            ) : (
              <ul className="space-y-1">
                {trace.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2 text-sm">
                    <span className="w-8 shrink-0 text-right text-xs text-gray-400">{e.seq}</span>
                    <span className="w-40 shrink-0 truncate text-xs text-gray-500">
                      {e.from_agent}{e.to_agent ? ` → ${e.to_agent}` : ''}
                    </span>
                    <span className={`flex-1 ${decisionColor(e)}`}>{summarize(e)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink">Artifacts</h2>
            {artifacts.length === 0 ? (
              <p className="text-sm text-gray-500">No artifacts.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {artifacts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{a.kind}</span>
                    <span className="text-gray-500">{a.mime_type ?? ''}</span>
                    <span className="text-xs text-gray-400">{a.bytes ?? 0} bytes</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
