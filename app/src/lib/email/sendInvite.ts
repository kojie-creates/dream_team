// Phase 0 dev-safe email "send". Logs the invite URL and lands it in the
// success UI for the inviter to copy. Phase 3 swaps in Resend/Postmark per
// Open Decision #6 in the phase 0 plan.
//
// We deliberately do NOT route through Supabase Auth's invite email here —
// Supabase's invite flow creates an auth.users row tied to its own template,
// which is not the same lifecycle as our workspace_invites token. Keeping
// these systems separate avoids confusing two invite concepts.

export type SendInviteArgs = {
  inviteeEmail: string;
  inviteUrl: string;
  workspaceName: string;
  invitedByEmail: string | null;
  role: 'admin' | 'member';
};

export async function sendInvite(args: SendInviteArgs): Promise<{ delivered: 'console' }> {
  // Server console gets the link for the dev operator. Mailpit is not used for
  // this custom email; document this in app/docs/auth-setup.md when it lands.
  console.info(
    '[invite] %s invited %s as %s to "%s" — %s',
    args.invitedByEmail ?? 'unknown',
    args.inviteeEmail,
    args.role,
    args.workspaceName,
    args.inviteUrl,
  );
  return { delivered: 'console' };
}
