'use client';

import { useActionState } from 'react';
import { createInvite, type InviteState } from '@/app/actions/invites';

const initial: InviteState = { error: null };

export function InviteForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState(createInvite, initial);

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="slug" value={slug} />
        <label className="flex flex-col">
          <span className="text-xs text-neutral-400">Email</span>
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-64 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            placeholder="teammate@company.com"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-neutral-400">Role</span>
          <select
            name="role"
            defaultValue="member"
            className="mt-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm text-neutral-100"
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Send invite'}
        </button>
      </form>
      {state.error ? <p role="alert" className="text-xs text-red-400">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-xs text-emerald-400">{state.ok}</p> : null}
      {state.inviteUrl ? (
        <div className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
          <p className="text-xs text-neutral-400">Share this link with the invitee:</p>
          <code className="mt-1 block break-all text-xs text-neutral-200">{state.inviteUrl}</code>
        </div>
      ) : null}
    </div>
  );
}
