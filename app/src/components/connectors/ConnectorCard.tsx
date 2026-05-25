import Link from 'next/link';
import type { ConnectorCatalogEntry } from '@/lib/connectors/catalog';
import { CONNECTOR_STATUS_LABELS, type ConnectorStatus } from '@/lib/connectors/types';
import { disconnectGoogleCalendar } from '@/app/actions/connectors';

async function disconnectAction(formData: FormData): Promise<void> {
  'use server';
  await disconnectGoogleCalendar({ error: null, ok: null }, formData);
}

export type ConnectorRow = {
  id: string;
  provider: string;
  status: ConnectorStatus;
  scopes: string[];
  connected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
};

const STATUS_TONE: Record<ConnectorStatus | 'not_connected', string> = {
  not_connected: 'bg-neutral-800 text-neutral-300',
  disconnected: 'bg-neutral-800 text-neutral-300',
  connecting: 'bg-amber-900/40 text-amber-300',
  connected: 'bg-emerald-900/40 text-emerald-200',
  error: 'bg-rose-900/40 text-rose-200',
  revoked: 'bg-neutral-800 text-neutral-400',
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ConnectorCard({
  entry,
  row,
  workspaceSlug,
  accountEmail,
}: {
  entry: ConnectorCatalogEntry;
  row: ConnectorRow | null;
  workspaceSlug: string;
  accountEmail: string | null;
}) {
  const isGoogleCalendar = entry.provider === 'google_calendar';
  const status: ConnectorStatus | 'not_connected' = row ? row.status : 'not_connected';
  const statusLabel = row ? CONNECTOR_STATUS_LABELS[row.status] : 'Not connected';
  const tone = STATUS_TONE[status];
  const isFirstTarget = entry.phase === 'planned-t3';
  const connectedAt = fmtDate(row?.connected_at ?? null);
  const lastSyncAt = fmtDate(row?.last_sync_at ?? null);

  const isLive = isGoogleCalendar;
  const isConnected = status === 'connected';
  const connectHref = isLive
    ? `/w/${workspaceSlug}/settings/connectors/google-calendar/start`
    : null;

  return (
    <li className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-neutral-100">{entry.name}</p>
            {isFirstTarget ? (
              <span className="rounded bg-sky-950 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-200">
                First target
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-neutral-400">{entry.summary}</p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${tone}`}
        >
          {statusLabel}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-1 text-[11px] text-neutral-500 sm:grid-cols-2">
        <div>
          <dt className="uppercase tracking-wider text-neutral-600">Planned scopes</dt>
          <dd className="text-neutral-400">
            <ul className="list-disc pl-4">
              {entry.plannedScopes.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="space-y-0.5">
          {isConnected && accountEmail ? (
            <p>
              <span className="uppercase tracking-wider text-neutral-600">Account:</span>{' '}
              <span className="text-neutral-300">{accountEmail}</span>
            </p>
          ) : null}
          {row?.scopes?.length ? (
            <p>
              <span className="uppercase tracking-wider text-neutral-600">Granted:</span>{' '}
              <span className="text-neutral-400">{row.scopes.join(', ')}</span>
            </p>
          ) : null}
          {connectedAt ? (
            <p>
              <span className="uppercase tracking-wider text-neutral-600">Connected:</span>{' '}
              <span className="text-neutral-400">{connectedAt}</span>
            </p>
          ) : null}
          {lastSyncAt ? (
            <p>
              <span className="uppercase tracking-wider text-neutral-600">Last sync:</span>{' '}
              <span className="text-neutral-400">{lastSyncAt}</span>
            </p>
          ) : null}
          {row?.last_error ? (
            <p className="text-rose-300">
              <span className="uppercase tracking-wider text-rose-400/80">Last error:</span>{' '}
              <span>{row.last_error}</span>
            </p>
          ) : null}
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-between gap-3">
        {isLive && isConnected ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/w/${workspaceSlug}/settings/connectors/google-calendar`}
              className="rounded border border-sky-900/60 bg-sky-950/40 px-3 py-1 text-xs text-sky-200 hover:bg-sky-950/60"
            >
              View events
            </Link>
            <form action={disconnectAction}>
              <input type="hidden" name="slug" value={workspaceSlug} />
              <button
                type="submit"
                className="rounded border border-rose-900/60 bg-rose-950/40 px-3 py-1 text-xs text-rose-200 hover:bg-rose-950/60"
              >
                Disconnect
              </button>
            </form>
          </div>
        ) : isLive && status === 'error' ? (
          <Link
            href={connectHref ?? '#'}
            className="rounded border border-amber-900/60 bg-amber-950/40 px-3 py-1 text-xs text-amber-200 hover:bg-amber-950/60"
          >
            Reconnect Google Calendar
          </Link>
        ) : isLive ? (
          <Link
            href={connectHref ?? '#'}
            className="rounded border border-sky-900/60 bg-sky-950/40 px-3 py-1 text-xs text-sky-200 hover:bg-sky-950/60"
          >
            Connect Google Calendar
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="cursor-not-allowed rounded border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-400"
          >
            Later
          </button>
        )}
        <p className="text-[11px] text-neutral-500">{entry.actionNote}</p>
      </div>
    </li>
  );
}

