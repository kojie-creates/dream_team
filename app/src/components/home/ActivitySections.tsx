import { EmptyPanel } from './EmptyPanel';

export function ActivitySections() {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-neutral-200">Activity</h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <EmptyPanel
          title="Recent activity"
          hint="Briefs you submit and the routing decisions they trigger show up here, newest first."
        />
        <EmptyPanel
          title="Tickets"
          hint="Every brief becomes a ticket the Orchestrator routes. Open tickets live here with their current agent."
        />
        <EmptyPanel
          title="Workflow runs"
          hint="When a coordinator hands off to specialists, each step lands in this log with timing and verdict."
        />
      </div>
    </section>
  );
}
