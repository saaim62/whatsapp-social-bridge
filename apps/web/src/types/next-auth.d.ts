import 'next-auth';
import type { DefaultSession } from 'next-auth';

/**
 * The NestJS login response carries fields NextAuth's stock types do
 * not know about (access token, role, trial state). Augment the
 * next-auth types once so callbacks and the API client stay typed.
 */
declare module 'next-auth' {
  interface User {
    role?: string;
    trialExpired?: boolean;
    accessToken?: string;
  }

  interface Session {
    accessToken?: string;
    user: {
      id?: string;
      role?: string;
      trialExpired?: boolean;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    id?: string;
    role?: string;
    trialExpired?: boolean;
  }
}
