import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/env';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();
  const path = url.pathname;

  const isProtected = path.startsWith('/w') || path.startsWith('/onboarding');
  const isAuthPage =
    path === '/signin' || path === '/signup' || path === '/forgot-password' || path === '/reset-password';

  if (isProtected && !user) {
    url.pathname = '/signin';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && user && path !== '/reset-password') {
    url.pathname = '/onboarding';
    url.searchParams.delete('next');
    return NextResponse.redirect(url);
  }

  return response;
}
