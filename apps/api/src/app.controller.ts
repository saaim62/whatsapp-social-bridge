import { Controller, Get, OnModuleDestroy, Res } from '@nestjs/common';
import { Response } from 'express';
import Redis from 'ioredis';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class AppController implements OnModuleDestroy {
  /** Shared Redis client for readiness pings — created lazily once and
   *  reused across requests (previously every /health/ready call paid
   *  for a fresh TCP connect + AUTH + disconnect). */
  private redis: Redis | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });
      // Readiness must report 'down', not crash on connection errors.
      this.redis.on('error', () => undefined);
    }
    return this.redis;
  }

  onModuleDestroy() {
    this.redis?.disconnect();
    this.redis = null;
  }

  /** Liveness: the process is up. */
  @Get()
  checkHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: the process can actually serve traffic (DB + Redis reachable).
   *  Returns HTTP 503 when any dependency is down — a 200 with a
   *  "not_ready" body is invisible to load balancers and uptime checks. */
  @Get('ready')
  async checkReadiness(@Res() res: Response) {
    const checks: Record<string, string> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    try {
      await this.getRedis().ping();
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
    }

    const ready = Object.values(checks).every((v) => v === 'up');
    return res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  }
}
