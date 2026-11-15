import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';

interface LoginResponse {
  access_token: string;
  user: {
    id?: string;
    email: string;
    name?: string;
    role?: string;
    trialExpired?: boolean;
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001'}/api/account/login`,
            {
              email: credentials.email,
              password: credentials.password,
            },
          );
          const user = res.data as LoginResponse;
          if (user && user.access_token) {
            return {
              id: user.user.id || credentials.email, // backend should return userId
              email: user.user.email,
              name: user.user.name,
              role: user.user.role,
              trialExpired: user.user.trialExpired,
              accessToken: user.access_token,
            };
          }
          return null;
        } catch (e) {
          const data = axios.isAxiosError(e)
            ? (e.response?.data as { message?: string } | undefined)
            : undefined;
          throw new Error(data?.message || 'Invalid credentials');
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.id = user.id;
        token.role = user.role;
        token.trialExpired = user.trialExpired;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.trialExpired = token.trialExpired;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 365 * 24 * 60 * 60, // 365 days
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET || 'fallback_secret_for_dev',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
