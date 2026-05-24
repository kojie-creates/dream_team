const CONNECTORS = [
  { name: 'Gmail', body: 'Pull threads as briefs; reply with drafts.' },
  { name: 'Calendar', body: 'Pull events; schedule deadlines on tickets.' },
  { name: 'Drive', body: 'Ingest docs; export artifacts.' },
  { name: 'Slack', body: 'Post status; route mentions into the queue.' },
];

export function ConnectorsPanel() {
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-neutral-200">Connectors</h2>
        <span className="rounded border border-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
          Coming later
        </span>
      </header>
      <p className="text-xs text-neutral-500">
        Inbox, calendar, drive, and chat will feed the work queue. Phase 0 ships the dashboard; connectors arrive
        in a later phase.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CONNECTORS.map((c) => (
          <div
            key={c.name}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-left opacity-80"
            aria-disabled
          >
            <p className="text-sm font-medium text-neutral-200">{c.name}</p>
            <p className="mt-1 text-xs text-neutral-500">{c.body}</p>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-neutral-600">Connect later</p>
          </div>
        ))}
      </div>
    </section>
  );
}
