import { type NextRequest, NextResponse } from 'next/server';

// Route access control.
//
// Auth state is inferred from the token cookies (set client-side via js-cookie,
// so they are readable here). The access token is short-lived (~1h) but the
// refresh token lasts 7 days and the axios interceptor refreshes transparently,
// so either cookie means "signed in". An expired access-token cookie is removed
// by the browser automatically, so its mere presence is a good signal.

// App routes only signed-in users should reach.
const PROTECTED_PREFIXES = ['/dashboard', '/library', '/favorites'];
// Guest-only routes signed-in users shouldn't land on.
const GUEST_ONLY_EXACT = ['/login', '/register'];

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const hasAuth = !!(
    req.cookies.get('accessToken') || req.cookies.get('refreshToken')
  );

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (isProtected && !hasAuth) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (hasAuth) {
    // The bare /stories page is the guest home; /stories with a category or
    // filter is a browse list both audiences use, so only redirect the former.
    const isGuestStoriesHome =
      pathname === '/stories' &&
      !searchParams.has('filter') &&
      !searchParams.has('category');
    if (GUEST_ONLY_EXACT.includes(pathname) || isGuestStoriesHome) {
      const url = req.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/register',
    '/stories',
    '/dashboard/:path*',
    '/library/:path*',
    '/favorites/:path*',
  ],
};
