'use client';

import { useActionState } from 'react';
import { updatePassword, type AuthState } from '@/app/actions/auth';
import { AuthFeedback } from './AuthFeedback';

const initial: AuthState = { error: null };

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, initial);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-neutral-400">Set a new password for your account.</p>
      <label className="block">
        <span className="text-xs text-neutral-300">New password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save password'}
      </button>
      <AuthFeedback state={state} />
    </form>
  );
}
