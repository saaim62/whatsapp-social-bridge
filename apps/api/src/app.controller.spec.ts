import { AppController } from './app.controller';
import type { PrismaService } from './prisma/prisma.service';
import type { Response } from 'express';

interface ReadinessBody {
  status: string;
  checks: { database: string; redis: string };
}

interface ResMock {
  status: jest.Mock<ResMock, [number]>;
  json: jest.Mock<ResMock, [ReadinessBody]>;
}

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    disconnect: jest.fn(),
    on: jest.fn(),
  })),
}));

describe('AppController readiness', () => {
  function makeRes(): ResMock {
    const res = {} as ResMock;
    res.status = jest.fn<ResMock, [number]>().mockReturnValue(res);
    res.json = jest.fn<ResMock, [ReadinessBody]>().mockReturnValue(res);
    return res;
  }

  it('returns HTTP 200 when DB and Redis are up', async () => {
    const prisma = {
      $queryRaw: jest
        .fn<Promise<unknown>, [unknown]>()
        .mockResolvedValue([{ '?column?': 1 }]),
    };
    const controller = new AppController(prisma as unknown as PrismaService);
    const res = makeRes();
    await controller.checkReadiness(res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].status).toBe('ready');
  });

  it('returns HTTP 503 (not 200) when the DB is down', async () => {
    const prisma = {
      $queryRaw: jest
        .fn<Promise<unknown>, [unknown]>()
        .mockRejectedValue(new Error('db down')),
    };
    const controller = new AppController(prisma as unknown as PrismaService);
    const res = makeRes();
    await controller.checkReadiness(res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(503);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe('not_ready');
    expect(body.checks.database).toBe('down');
  });
});
