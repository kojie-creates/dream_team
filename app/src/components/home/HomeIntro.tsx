export function HomeIntro({ workspaceName }: { workspaceName: string }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-neutral-500">{workspaceName}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
          What work do you want to turn into a brief?
        </h1>
        <p className="max-w-2xl text-sm text-neutral-400">
          Drop in something you have or describe it — the Orchestrator turns it into a ticket, picks the
          right layer, and runs it through the team. You stay in this view and watch it land.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled
          title="Coming next — Phase 1"
          className="rounded border border-neutral-800 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-90"
        >
          Upload a brief
        </button>
        <button
          type="button"
          disabled
          title="Coming next — Phase 1"
          className="rounded border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 disabled:cursor-not-allowed disabled:opacity-90"
        >
          Generate with chat
        </button>
        <span className="self-center text-xs text-neutral-600">Both inputs become a ticket the same way.</span>
      </div>
    </section>
  );
}
