'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, type AuthState } from '@/app/actions/auth';
import { AuthFeedback } from './AuthFeedback';

const initial: AuthState = { error: null };

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next ?? '/onboarding'} />
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
      <label className="block">
        <span className="text-xs text-neutral-300">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      <AuthFeedback state={state} />
      <div className="flex justify-between pt-2 text-xs text-neutral-400">
        <Link href="/forgot-password" className="hover:text-neutral-200">
          Forgot password?
        </Link>
        <Link href="/signup" className="hover:text-neutral-200">
          Create account
        </Link>
      </div>
    </form>
  );
}
