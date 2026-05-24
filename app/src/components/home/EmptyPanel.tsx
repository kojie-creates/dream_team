import type { ReactNode } from 'react';

export function EmptyPanel({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-200">{title}</h3>
        {children}
      </header>
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">{hint}</p>
    </div>
  );
}
