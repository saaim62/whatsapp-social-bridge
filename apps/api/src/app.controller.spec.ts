import { AppController } from './app.controller';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    disconnect: jest.fn(),
  })),
}));

describe('AppController readiness', () => {
  function makeRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  it('returns HTTP 200 when DB and Redis are up', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const controller = new AppController(prisma as any);
    const res = makeRes();
    await controller.checkReadiness(res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].status).toBe('ready');
  });

  it('returns HTTP 503 (not 200) when the DB is down', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const controller = new AppController(prisma as any);
    const res = makeRes();
    await controller.checkReadiness(res);
    expect(res.status).toHaveBeenCalledWith(503);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe('not_ready');
    expect(body.checks.database).toBe('down');
  });
});
