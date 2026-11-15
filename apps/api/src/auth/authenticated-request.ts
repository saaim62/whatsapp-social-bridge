import { Request } from 'express';
import { User } from '@prisma/client';

/** Shape JwtStrategy.validate() attaches to `req.user`. */
export interface JwtUser {
  userId: string;
  email: string;
}

/**
 * An Express request after JwtAuthGuard has run. `dbUser` is attached
 * additionally by AdminGuard/OwnerGuard on admin routes.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtUser;
  dbUser?: User;
}

/** Request on admin routes, where AdminGuard guarantees `dbUser`. */
export interface AdminAuthenticatedRequest extends AuthenticatedRequest {
  dbUser: User;
}
