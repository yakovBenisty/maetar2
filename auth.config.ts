import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

// Edge-safe config — no DB imports here (used by middleware)
export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ?? 'common'}/v2.0`,
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname.startsWith('/login') || pathname.startsWith('/api/auth');
      if (isPublic) return true;
      return isLoggedIn;
    },
    session({ session, token }) {
      if (session.user && token) {
        session.user.role = (token.role as string) ?? 'user';
        session.user.firstName = (token.firstName as string) ?? '';
        session.user.lastName = (token.lastName as string) ?? '';
      }
      return session;
    },
  },
};
