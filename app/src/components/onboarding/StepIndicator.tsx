export function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div
            key={n}
            className={[
              'h-1.5 flex-1 rounded-full transition-colors',
              done ? 'bg-emerald-500' : active ? 'bg-neutral-100' : 'bg-neutral-800',
            ].join(' ')}
          />
        );
      })}
    </div>
  );
}
