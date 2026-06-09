import { useEffect, useState } from 'react';
import { listConnectors, type Connector } from '../lib/db.ts';
import { Card, Spinner, ErrorNote } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';

const PROVIDERS: Array<{ id: string; name: string }> = [
  { id: 'google_calendar', name: 'Google Calendar' },
  { id: 'gmail', name: 'Gmail' },
  { id: 'google_drive', name: 'Google Drive' },
  { id: 'google_sheets', name: 'Google Sheets' },
  { id: 'slack', name: 'Slack' },
  { id: 'notion', name: 'Notion' },
];

function statusBadge(status: string | undefined): JSX.Element {
  const connected = status === 'connected';
  const cls = connected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{status ?? 'not set up'}</span>;
}

export function Connectors(): JSX.Element {
  const { ready, status } = useAuth();
  const [rows, setRows] = useState<Connector[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !status?.hasSession) return;
    let live = true;
    listConnectors().then((r) => live && setRows(r)).catch((e) => live && setErr(String(e.message ?? e)));
    return () => { live = false; };
  }, [ready, status?.hasSession]);

  if (ready && !status?.hasSession) return <ErrorNote>Sign in (Settings) to see connectors.</ErrorNote>;
  const byProvider = new Map((rows ?? []).map((r) => [r.provider, r]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Connectors</h1>
        <p className="text-sm text-gray-500">
          Connect accounts in the web app; the intern uses them (calendar, email, …) during runs.
        </p>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}
      {!rows ? (
        <Spinner />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-gray-100">
            {PROVIDERS.map((p) => {
              const row = byProvider.get(p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-1 text-sm text-ink">{p.name}</span>
                  {row?.last_error && <span className="text-xs text-red-600">{row.last_error}</span>}
                  {statusBadge(row?.status)}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
