import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') ?? '/onboarding';

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(error.message)}`, url.origin));
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'email' | 'recovery' | 'signup' | 'invite' | 'magiclink' | 'email_change',
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(error.message)}`, url.origin));
    }
  } else {
    return NextResponse.redirect(new URL('/signin?error=missing_code', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
