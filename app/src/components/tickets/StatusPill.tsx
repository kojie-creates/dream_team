const STATUS_TONE: Record<string, string> = {
  open: 'bg-neutral-800 text-neutral-200',
  in_progress: 'bg-sky-950 text-sky-200',
  needs_input: 'bg-amber-950 text-amber-200',
  done: 'bg-emerald-950 text-emerald-200',
  failed: 'bg-red-950 text-red-200',
  looped: 'bg-fuchsia-950 text-fuchsia-200',
  pending: 'bg-neutral-800 text-neutral-300',
  running: 'bg-sky-950 text-sky-200',
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  needs_input: 'Needs input',
  done: 'Done',
  failed: 'Failed',
  looped: 'Looped',
  pending: 'Pending',
  running: 'Running',
};

export function StatusPill({
  status,
  size = 'sm',
}: {
  status: string;
  size?: 'xs' | 'sm';
}) {
  const tone = STATUS_TONE[status] ?? 'bg-neutral-800 text-neutral-200';
  const label = STATUS_LABEL[status] ?? status.replace('_', ' ');
  const sizeClass =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px]'
      : 'px-2 py-0.5 text-[11px]';
  return (
    <span className={`rounded font-medium uppercase tracking-wider ${sizeClass} ${tone}`}>
      {label}
    </span>
  );
}
