export function DomainCard({
  title,
  body,
  example,
}: {
  title: string;
  body: string;
  example: string;
}) {
  return (
    <button
      type="button"
      disabled
      title="Coming next — Phase 1"
      className="group flex flex-col rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-left transition-colors hover:border-neutral-700 disabled:cursor-not-allowed disabled:opacity-90"
    >
      <span className="text-sm font-medium text-neutral-100">{title}</span>
      <span className="mt-1 text-xs text-neutral-400">{body}</span>
      <span className="mt-3 text-[11px] uppercase tracking-wide text-neutral-600">Example brief</span>
      <span className="mt-0.5 text-xs text-neutral-300">{example}</span>
    </button>
  );
}
