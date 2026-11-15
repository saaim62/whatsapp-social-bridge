import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from '../authenticated-request';

/**
 * Admin area access: ADMIN and OWNER roles. The role is loaded fresh
 * from the database on every request, so promotions and demotions take
 * effect immediately (no stale JWT claims). On success the database
 * user is attached as `request.dbUser` for controllers to use as the
 * acting principal (audit trail, owner checks).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user; // Set by JwtAuthGuard

    if (!user || !user.userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'OWNER')) {
      throw new ForbiddenException('Admin access required');
    }

    request.dbUser = dbUser;
    return true;
  }
}
