import { type NextRequest, NextResponse } from 'next/server';
import { hasUsableSession } from '@/lib/session';

// Route access control.
//
// Auth state is inferred from the token cookies (set client-side via js-cookie,
// so they are readable here). The access token is short-lived (~1h) but the
// refresh token lasts 7 days and the axios interceptor refreshes transparently,
// so a refresh token means "signed in". An access token alone only counts while
// it is unexpired (lib/session.ts, same rule as isUserLoggedIn): an expired
// access cookie with no refresh token is a dead session, so protected routes
// redirect to /login instead of letting the user in to fail every request.

// App routes only signed-in users should reach.
const PROTECTED_PREFIXES = ['/dashboard', '/library', '/favorites'];
// Guest-only routes signed-in users shouldn't land on.
const GUEST_ONLY_EXACT = ['/login', '/register'];

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const hasAuth = hasUsableSession({
    accessToken: req.cookies.get('accessToken')?.value,
    refreshToken: req.cookies.get('refreshToken')?.value,
  });

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (isProtected && !hasAuth) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // A logout hands off to /login?loggedOut=1. Never bounce that back to the
  // dashboard even if a stale token cookie lingers — the login page clears it.
  // This is the escape hatch that stops a dead session from trapping the user.
  const isLoggingOut = searchParams.has('loggedOut');

  if (hasAuth && !isLoggingOut) {
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
