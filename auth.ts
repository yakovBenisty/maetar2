import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { getDb } from './lib/mongo';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user }) {
      if (!user.email) return false;
      try {
        const db = await getDb();
        const dbUser = await db.collection('USERS').findOne({ email: user.email });
        if (!dbUser) {
          // Bootstrap: first admin pre-configured via env var
          if (user.email === process.env.ADMIN_EMAIL) {
            const parts = (user.name ?? '').split(' ');
            await db.collection('USERS').insertOne({
              email: user.email,
              firstName: parts[0] ?? '',
              lastName: parts.slice(1).join(' ') ?? '',
              role: 'admin',
              createdAt: new Date(),
            });
            return true;
          }
          return '/login?error=NotAuthorized';
        }
        return true;
      } catch {
        return false;
      }
    },

    async jwt({ token, user }) {
      // Runs only on sign-in (user is present) or token refresh
      if (user?.email) {
        try {
          const db = await getDb();
          const dbUser = await db
            .collection('USERS')
            .findOne({ email: user.email });
          if (dbUser) {
            token.role = dbUser.role;
            token.firstName = dbUser.firstName;
            token.lastName = dbUser.lastName;
          }
        } catch {
          // keep existing token values
        }
      }
      return token;
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
});
