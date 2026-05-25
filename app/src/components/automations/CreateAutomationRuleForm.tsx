'use client';

import { useActionState } from 'react';
import { createAutomationRule, type CreateRuleState } from '@/app/actions/automations';

const initial: CreateRuleState = { error: null, ok: null };

export function CreateAutomationRuleForm({
  slug,
  disabled,
  disabledReason,
}: {
  slug: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(createAutomationRule, initial);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="block text-neutral-400">Rule name</span>
          <input
            name="name"
            type="text"
            required
            maxLength={80}
            disabled={disabled || pending}
            placeholder="e.g. Daily standup brief"
            className="mt-1 w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-60"
          />
        </label>
        <label className="block text-xs">
          <span className="block text-neutral-400">Event window</span>
          <select
            name="window_days"
            defaultValue="7"
            disabled={disabled || pending}
            className="mt-1 w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-60"
          >
            <option value="7">Next 7 days</option>
            <option value="14">Next 14 days</option>
          </select>
        </label>
      </div>

      <label className="block text-xs">
        <span className="block text-neutral-400">
          Match text (optional — substring of title, location, or description)
        </span>
        <input
          name="match_text"
          type="text"
          maxLength={200}
          disabled={disabled || pending}
          placeholder="standup"
          className="mt-1 w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-60"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={disabled || pending}
          className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create rule (paused)'}
        </button>
        <span className="text-[11px] text-neutral-500">
          New rules start paused. Manual run required.
        </span>
      </div>

      {disabled && disabledReason ? (
        <p className="text-xs text-amber-300">{disabledReason}</p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-xs text-rose-300">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-xs text-emerald-300">{state.ok}</p> : null}
    </form>
  );
}
