import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { StorageService } from '../storage/storage.service';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';

export type Actor = { id: string; email: string; role: string };

interface DayCountRow {
  date: Date;
  count: number;
}

interface DaySizeRow {
  date: Date;
  size: bigint;
}

/** The user shape mapUser reads (list and detail queries both satisfy it). */
export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isPaid: boolean;
  isBlocked: boolean;
  isEmailVerified: boolean;
  trialEndsAt: Date | null;
  lastActiveAt: Date | null;
  createdAt: Date;
  city: string | null;
  country: string | null;
  storageLimitBytes: bigint;
  batches?: Array<{ mediaAssets: Array<{ fileSize: number | null }> }>;
  _count?: { batches?: number; sources?: number; socialAccounts?: number };
}

/** Plan state derived from the billing fields — one definition, used everywhere. */
export function planStatusOf(u: {
  isBlocked: boolean;
  isPaid: boolean;
  trialEndsAt: Date | null;
}): 'PAID' | 'TRIAL' | 'EXPIRED' | 'BLOCKED' {
  if (u.isBlocked) return 'BLOCKED';
  if (u.isPaid) return 'PAID';
  if (u.trialEndsAt && u.trialEndsAt.getTime() > Date.now()) return 'TRIAL';
  return 'EXPIRED';
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  // ---------------------------------------------------------------- audit
  private async audit(
    actor: Actor,
    action: string,
    target?: { id?: string; email?: string },
    details?: Prisma.InputJsonObject,
  ) {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          actorId: actor.id,
          actorEmail: actor.email,
          action,
          targetUserId: target?.id ?? null,
          targetEmail: target?.email ?? null,
          details: details ?? undefined,
        },
      });
    } catch (err) {
      // Auditing must never break the action it records.
      this.logger.error(`Failed to write audit log (${action}): ${err}`);
    }
  }

  async getAudit(limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    return this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ------------------------------------------------------------------- me
  async getMe(actorId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ---------------------------------------------------------------- stats
  async getDashboardStats() {
    const now = new Date();
    const [
      totalUsers,
      totalBatches,
      activePipelines,
      paidUsers,
      trialActiveUsers,
      blockedUsers,
      unverifiedUsers,
      teamMembers,
      signups7d,
      signups30d,
      sourcesEnabled,
      failedBatches,
      failedPublications,
      failedPublications7d,
      totalPublications,
      publishedPublications,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.productBatch.count(),
      this.prisma.productBatch.count({
        where: { status: { notIn: ['PUBLISHED', 'FAILED', 'RECEIVED'] } },
      }),
      this.prisma.user.count({ where: { isPaid: true } }),
      this.prisma.user.count({
        where: { isPaid: false, trialEndsAt: { gt: now } },
      }),
      this.prisma.user.count({ where: { isBlocked: true } }),
      this.prisma.user.count({ where: { isEmailVerified: false } }),
      this.prisma.user.count({ where: { role: { in: ['ADMIN', 'OWNER'] } } }),
      this.prisma.user.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
      }),
      this.prisma.whatsappSource.count({ where: { isEnabled: true } }),
      this.prisma.productBatch.count({ where: { status: 'FAILED' } }),
      this.prisma.publication.count({ where: { status: 'FAILED' } }),
      this.prisma.publication.count({
        where: {
          status: 'FAILED',
          createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
        },
      }),
      this.prisma.publication.count(),
      this.prisma.publication.count({ where: { status: 'PUBLISHED' } }),
    ]);

    const expiredUsers = totalUsers - paidUsers - trialActiveUsers;

    const batchesByStatusRows = await this.prisma.productBatch.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    const batchesByStatus: Record<string, number> = {};
    for (const row of batchesByStatusRows) {
      batchesByStatus[row.status] = row._count.id;
    }

    const mediaAgg = await this.prisma.mediaAsset.aggregate({
      _sum: { fileSize: true },
      _count: { id: true },
    });

    const activeUsersByDay: DayCountRow[] = await this.prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "lastActiveAt") as date, COUNT(*)::int as count
      FROM "User"
      WHERE "lastActiveAt" >= NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('day', "lastActiveAt")
      ORDER BY date ASC
    `;

    const signupsByDay: DayCountRow[] = await this.prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "createdAt") as date, COUNT(*)::int as count
      FROM "User"
      WHERE "createdAt" >= NOW() - INTERVAL '14 days'
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY date ASC
    `;

    const storageByDay: DaySizeRow[] = await this.prisma.$queryRaw`
      SELECT DATE_TRUNC('day', "createdAt") as date, COALESCE(SUM("fileSize"), 0)::bigint as size
      FROM "MediaAsset"
      WHERE "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY date ASC
    `;

    // Real disk figures for the uploads volume (the old code reported a
    // hardcoded "50 GB Hugging Face" total from the boilerplate era).
    let serverStorageConsumedBytes = 0;
    let serverStorageTotalBytes: number | null = null;
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (fs.existsSync(uploadsDir)) {
        serverStorageConsumedBytes = this.dirSize(uploadsDir);
      }
      if (typeof fs.statfsSync === 'function') {
        const stat = fs.statfsSync(process.cwd());
        serverStorageTotalBytes = Number(stat.blocks) * Number(stat.bsize);
      }
    } catch (err) {
      this.logger.warn(`Disk stats unavailable: ${err}`);
    }
    const serverStorageFreeBytes =
      serverStorageTotalBytes !== null
        ? Math.max(serverStorageTotalBytes - serverStorageConsumedBytes, 0)
        : null;

    const r2Accounts = await this.storageService.getStorageStats();

    return {
      totalUsers,
      totalBatches,
      activePipelines,
      totalMediaCount: mediaAgg._count.id || 0,
      totalStorageBytes: mediaAgg._sum.fileSize || 0,
      serverStorageTotalBytes,
      serverStorageConsumedBytes,
      serverStorageFreeBytes,
      r2Accounts,
      users: {
        paid: paidUsers,
        trialActive: trialActiveUsers,
        expired: expiredUsers,
        blocked: blockedUsers,
        unverified: unverifiedUsers,
        team: teamMembers,
      },
      signups7d,
      signups30d,
      // The product costs $10/month (see the trial-lock screen), so paid
      // users × $10 is the honest MRR proxy until real billing lands.
      mrrEstimate: paidUsers * 10,
      trialConversion:
        totalUsers > 0 ? Math.round((paidUsers / totalUsers) * 1000) / 10 : 0,
      sourcesEnabled,
      batchesByStatus,
      publications: {
        total: totalPublications,
        published: publishedPublications,
        failed: failedPublications,
        failedLast7d: failedPublications7d,
      },
      failedBatches,
      activeUsersByDay: activeUsersByDay.map((row) => ({
        date: row.date,
        count: Number(row.count),
      })),
      signupsByDay: signupsByDay.map((row) => ({
        date: row.date,
        count: Number(row.count),
      })),
      storageByDay: storageByDay.map((row) => ({
        date: row.date,
        size: Number(row.size),
      })),
    };
  }

  private dirSize(dirPath: string): number {
    let size = 0;
    for (const entry of fs.readdirSync(dirPath)) {
      const filePath = path.join(dirPath, entry);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) size += stats.size;
      else if (stats.isDirectory()) size += this.dirSize(filePath);
    }
    return size;
  }

  // ---------------------------------------------------------------- users
  private mapUser(user: AdminUserRow) {
    let totalMedia = 0;
    let totalStorage = 0;
    if (Array.isArray(user.batches)) {
      user.batches.forEach((b) => {
        totalMedia += b.mediaAssets?.length || 0;
        b.mediaAssets?.forEach((m) => {
          totalStorage += m.fileSize || 0;
        });
      });
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      planStatus: planStatusOf(user),
      isPaid: user.isPaid,
      isBlocked: user.isBlocked,
      isEmailVerified: user.isEmailVerified,
      trialEndsAt: user.trialEndsAt,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      city: user.city,
      country: user.country,
      batchCount: user._count?.batches ?? user.batches?.length ?? 0,
      sourceCount: user._count?.sources ?? 0,
      socialAccountCount: user._count?.socialAccounts ?? 0,
      mediaCount: totalMedia,
      storageUsed: totalStorage,
      storageLimitBytes: Number(user.storageLimitBytes),
    };
  }

  async getUsers(query: {
    search?: string;
    filter?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(query.page || 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize || 20, 1), 100);
    const now = new Date();

    const where: Prisma.UserWhereInput = {};
    const andClauses: Prisma.UserWhereInput[] = [];
    if (query.search) {
      andClauses.push({
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    switch (query.filter) {
      case 'paid':
        where.isPaid = true;
        break;
      case 'trial':
        where.isPaid = false;
        where.trialEndsAt = { gt: now };
        break;
      case 'expired':
        where.isPaid = false;
        andClauses.push({
          OR: [{ trialEndsAt: { lte: now } }, { trialEndsAt: null }],
        });
        break;
      case 'blocked':
        where.isBlocked = true;
        break;
      case 'unverified':
        where.isEmailVerified = false;
        break;
      case 'team':
        where.role = { in: ['ADMIN', 'OWNER'] };
        break;
    }
    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: { batches: true, sources: true, socialAccounts: true },
          },
          batches: {
            select: { mediaAssets: { select: { fileSize: true } } },
          },
        },
      }),
    ]);

    return {
      users: users.map((u) => this.mapUser(u)),
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  /** Backwards-compatible unpaginated list (first page, large). */
  async getAllUsers() {
    const result = await this.getUsers({ page: 1, pageSize: 100 });
    return result.users;
  }

  async getUserDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: { batches: true, sources: true, socialAccounts: true },
        },
        settings: true,
        batches: {
          select: { mediaAssets: { select: { fileSize: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const [recentBatches, auditTrail] = await Promise.all([
      this.prisma.productBatch.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          senderName: true,
          createdAt: true,
          _count: { select: { mediaAssets: true } },
        },
      }),
      this.prisma.adminAuditLog.findMany({
        where: { targetUserId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const { settings, ...rest } = user;
    return {
      ...this.mapUser(rest),
      settings: settings
        ? {
            isSyncActive: settings.isSyncActive,
            marginType: settings.marginType,
            marginValue: settings.marginValue,
            priceRounding: settings.priceRounding,
          }
        : null,
      recentBatches: recentBatches.map((b) => ({
        id: b.id,
        status: b.status,
        senderName: b.senderName,
        createdAt: b.createdAt,
        mediaCount: b._count.mediaAssets,
      })),
      auditTrail,
    };
  }

  // ------------------------------------------------------------- actions
  async extendTrial(actor: Actor, userId: string, days: number) {
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new BadRequestException(
        'Days must be a whole number between 1 and 365',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const base = Math.max(Date.now(), user.trialEndsAt?.getTime() ?? 0);
    const trialEndsAt = new Date(base + days * 86400_000);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { trialEndsAt },
    });
    await this.audit(
      actor,
      'EXTEND_TRIAL',
      { id: user.id, email: user.email },
      {
        days,
        trialEndsAt,
      },
    );
    return {
      id: updated.id,
      email: updated.email,
      trialEndsAt: updated.trialEndsAt,
      planStatus: planStatusOf(updated),
    };
  }

  async setPaid(actor: Actor, userId: string, isPaid: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isPaid },
    });
    await this.audit(
      actor,
      isPaid ? 'GRANT_COMP' : 'REVOKE_COMP',
      { id: user.id, email: user.email },
      { isPaid },
    );
    return {
      id: updated.id,
      email: updated.email,
      isPaid: updated.isPaid,
      planStatus: planStatusOf(updated),
    };
  }

  async toggleBlockStatus(actor: Actor, userId: string, isBlocked: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'OWNER') {
      throw new ForbiddenException('The owner account cannot be blocked');
    }
    if (user.id === actor.id) {
      throw new ForbiddenException('You cannot block your own account');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isBlocked },
    });
    await this.audit(
      actor,
      isBlocked ? 'BLOCK' : 'UNBLOCK',
      { id: user.id, email: user.email },
      { isBlocked },
    );
    return {
      id: updated.id,
      email: updated.email,
      isBlocked: updated.isBlocked,
      planStatus: planStatusOf(updated),
    };
  }

  async updateStorageLimit(
    actor: Actor,
    userId: string,
    storageLimitBytes: number,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // NOTE: the boilerplate version of this method "archived" (deleted)
    // the user's media when a limit was lowered below their usage. A
    // quota change must never destroy customer data — it only gates
    // future uploads.
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { storageLimitBytes: BigInt(storageLimitBytes) },
    });
    await this.audit(
      actor,
      'SET_STORAGE',
      { id: user.id, email: user.email },
      {
        storageLimitBytes,
      },
    );
    return {
      success: true,
      storageLimitBytes: Number(updated.storageLimitBytes),
    };
  }

  // ----------------------------------------------------------------- team
  async getTeam() {
    const members = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'OWNER'] } },
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
      include: {
        _count: {
          select: { batches: true, sources: true, socialAccounts: true },
        },
      },
    });
    return members.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt,
    }));
  }

  /**
   * Owner-only (enforced by OwnerGuard in the controller). Owners grant
   * and revoke ADMIN — never OWNER: ownership itself is set at the
   * database level on purpose, so no account compromise in the console
   * can mint a new owner or strip the real one.
   */
  async setRole(actor: Actor, targetUserId: string, role: string) {
    if (role !== 'ADMIN' && role !== 'USER') {
      throw new BadRequestException('Role must be ADMIN or USER');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'OWNER') {
      throw new ForbiddenException('Owner accounts cannot be changed');
    }
    if (target.id === actor.id) {
      throw new ForbiddenException('You cannot change your own role');
    }
    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
    });
    await this.audit(
      actor,
      'SET_ROLE',
      { id: target.id, email: target.email },
      {
        from: target.role,
        to: role,
      },
    );
    return { id: updated.id, email: updated.email, role: updated.role };
  }

  // --------------------------------------------------------------- system
  async getSystemHealth() {
    let database = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      // Probe failed: database stays 'down'.
    }

    let redisStatus = 'down';
    const queues: Record<
      string,
      { waiting: number; active: number; delayed: number; failed: number }
    > = {};
    const redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    try {
      await redis.connect();
      await redis.ping();
      redisStatus = 'up';
      // BullMQ key layout: bull:<queue>:wait|active are lists,
      // delayed|failed are sorted sets, prioritized is a sorted set.
      for (const name of [
        'batch-processing',
        'history-sync-queue',
        'image-blur',
      ]) {
        const [wait, prioritized, active, delayed, failed] = await Promise.all([
          redis.llen(`bull:${name}:wait`),
          redis.zcard(`bull:${name}:prioritized`),
          redis.llen(`bull:${name}:active`),
          redis.zcard(`bull:${name}:delayed`),
          redis.zcard(`bull:${name}:failed`),
        ]);
        queues[name] = {
          waiting: wait + prioritized,
          active,
          delayed,
          failed,
        };
      }
    } catch {
      redisStatus = 'down';
    } finally {
      redis.disconnect();
    }

    const [failedBatches, failedPublications7d, r2Accounts] = await Promise.all(
      [
        this.prisma.productBatch.count({ where: { status: 'FAILED' } }),
        this.prisma.publication.count({
          where: {
            status: 'FAILED',
            createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
          },
        }),
        this.storageService.getStorageStats(),
      ],
    );

    return {
      database,
      redis: redisStatus,
      queues,
      r2Accounts,
      failedBatches,
      failedPublications7d,
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString(),
    };
  }
}
