import { SignInForm } from '@/components/auth/SignInForm';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <>
      <h2 className="mb-4 text-sm font-medium text-neutral-200">Sign in</h2>
      {error ? (
        <p role="alert" className="mb-3 text-xs text-red-400">
          {error}
        </p>
      ) : null}
      <SignInForm next={next} />
    </>
  );
}
