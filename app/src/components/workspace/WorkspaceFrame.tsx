import type { ReactNode } from 'react';
import { signOut } from '@/app/actions/auth';
import type { WorkspaceListItem } from '@/lib/workspace/list';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export function WorkspaceFrame({
  current,
  workspaces,
  children,
}: {
  current: WorkspaceListItem;
  workspaces: WorkspaceListItem[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-wider text-neutral-500">Dream Team</span>
            <WorkspaceSwitcher current={current} workspaces={workspaces} />
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded border border-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-700"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
