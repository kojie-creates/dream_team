'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkspaceListItem } from '@/lib/workspace/list';

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: WorkspaceListItem;
  workspaces: WorkspaceListItem[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 hover:border-neutral-700"
      >
        <span className="font-medium">{current.name}</span>
        <span className="text-xs text-neutral-500">/{current.slug}</span>
        <span aria-hidden className="text-neutral-500">
          ▾
        </span>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 mt-1 w-64 overflow-hidden rounded border border-neutral-800 bg-neutral-900 shadow-lg"
        >
          {workspaces.map((w) => {
            const selected = w.id === current.id;
            return (
              <li key={w.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!selected) router.push(`/w/${w.slug}`);
                  }}
                  className={[
                    'flex w-full items-baseline justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800',
                    selected ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-200',
                  ].join(' ')}
                >
                  <span className="truncate">{w.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-neutral-500">/{w.slug}</span>
                </button>
              </li>
            );
          })}
          {workspaces.length === 0 ? (
            <li className="px-3 py-2 text-xs text-neutral-500">No workspaces</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
