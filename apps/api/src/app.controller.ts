import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import Redis from 'ioredis';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

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
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
    } finally {
      redis.disconnect();
    }

    const ready = Object.values(checks).every((v) => v === 'up');
    return res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  }
}
