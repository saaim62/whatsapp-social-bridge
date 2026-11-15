import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Owner-only access. Used for the actions that define who holds power
 * in the system — granting or revoking admin roles. Admins can run the
 * console day to day, but they can never create or remove admins; only
 * an OWNER can. Runs after AdminGuard (which attaches request.dbUser),
 * but re-checks the database role so it is safe to use standalone.
 */
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Set by JwtAuthGuard

    if (!user || !user.userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!dbUser || dbUser.role !== 'OWNER') {
      throw new ForbiddenException('Owner access required');
    }

    request.dbUser = dbUser;
    return true;
  }
}
