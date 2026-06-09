import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listTickets, type Ticket } from '../lib/db.ts';
import { StatusPill, Card, Spinner, ErrorNote, relTime } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';

export function Tickets(): JSX.Element {
  const { ready, status } = useAuth();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !status?.hasSession) return;
    let live = true;
    const load = () => listTickets().then((t) => live && setTickets(t)).catch((e) => live && setErr(String(e.message ?? e)));
    void load();
    const id = setInterval(load, 4000); // light poll; Realtime replaces this in B4
    return () => { live = false; clearInterval(id); };
  }, [ready, status?.hasSession]);

  if (ready && !status?.hasSession) return <ErrorNote>Sign in (Settings) to see tickets.</ErrorNote>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">Tickets</h1>
      {err && <ErrorNote>{err}</ErrorNote>}
      {!tickets ? (
        <Spinner />
      ) : tickets.length === 0 ? (
        <Card><p className="text-sm text-gray-500">No tickets yet. Run a brief from Home.</p></Card>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-gray-100">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link to={`/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <StatusPill status={t.status} />
                  <span className="flex-1 truncate text-sm text-ink">{t.title ?? '(untitled)'}</span>
                  {t.layer && <span className="text-xs text-gray-400">{t.layer}</span>}
                  <span className="text-xs text-gray-400">{relTime(t.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
