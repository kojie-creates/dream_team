import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { acceptInviteAction } from '@/app/actions/invites';

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signin?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  let result: { slug: string } | null = null;
  let message: string | null = null;
  try {
    result = await acceptInviteAction(token);
  } catch (err) {
    message = err instanceof Error ? err.message : 'Unknown error.';
  }

  if (result) redirect(`/w/${result.slug}`);

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16 text-neutral-100">
      <div className="mx-auto max-w-sm space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <h1 className="text-lg font-semibold">Invite could not be accepted</h1>
        <p className="text-sm text-neutral-400">{message ?? 'Unknown error.'}</p>
        <p className="text-xs text-neutral-500">
          Ask the workspace owner to send a fresh invite link.
        </p>
        <Link href="/" className="inline-block text-xs text-neutral-300 underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}
