import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// Use Edge-safe config — no DB imports
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith('/login') || pathname.startsWith('/api/auth');

  if (!isLoggedIn && !isPublic) {
    return Response.redirect(new URL('/login', req.url));
  }

  if (isLoggedIn && pathname.startsWith('/login')) {
    return Response.redirect(new URL('/', req.url));
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
