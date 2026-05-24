import type { AuthState } from '@/app/actions/auth';

export function AuthFeedback({ state }: { state: AuthState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-3 text-xs text-red-400">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="mt-3 text-xs text-emerald-400">
        {state.ok}
      </p>
    );
  }
  return null;
}
