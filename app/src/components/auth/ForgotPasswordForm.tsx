'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordReset, type AuthState } from '@/app/actions/auth';
import { AuthFeedback } from './AuthFeedback';

const initial: AuthState = { error: null };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initial);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-neutral-400">
        Enter your email and we will send a reset link.
      </p>
      <label className="block">
        <span className="text-xs text-neutral-300">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
      <AuthFeedback state={state} />
      <div className="pt-2 text-xs text-neutral-400">
        <Link href="/signin" className="hover:text-neutral-200">
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
