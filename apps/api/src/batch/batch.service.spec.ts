import {
  BatchService,
  BlurImageJob,
  IncomingMessagePayload,
  ProcessBatchJob,
} from './batch.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';
import type { AiService } from '../ai/ai.service';
import type { OcrService } from '../ai/ocr.service';
import type { StorageService } from '../storage/storage.service';
import type { Queue } from 'bullmq';

interface BatchRow {
  id: string;
  userId: string;
  extractedData: Record<string, unknown>;
}

interface ContentRow {
  id: string;
  batchId: string;
  instagramCaption: string;
}

interface AssetRow {
  id: string;
  batchId: string;
  ocrConfidence: number | null;
}

interface BatchWhere {
  id?: { in: string[] };
  userId?: string;
}

interface ContentWhere {
  id?: { in: string[] };
  batch?: { userId: string };
}

interface AssetWhere {
  batchId?: { in: string[] };
  batch?: { userId: string };
}

type BatchFindResult = BatchRow & {
  generatedContent: ContentRow | null | undefined;
};

interface FakeTx {
  productBatch: {
    findMany: jest.Mock<
      Promise<BatchFindResult[]>,
      [{ where: BatchWhere; include?: { generatedContent?: boolean } }]
    >;
    updateMany: jest.Mock<
      Promise<{ count: number }>,
      [{ where: BatchWhere; data: Record<string, unknown> }]
    >;
  };
  generatedContent: {
    deleteMany: jest.Mock<
      Promise<{ count: number }>,
      [{ where: ContentWhere }]
    >;
  };
  mediaAsset: {
    updateMany: jest.Mock<
      Promise<{ count: number }>,
      [{ where: AssetWhere; data: Record<string, unknown> }]
    >;
  };
}

interface FakePrisma extends FakeTx {
  $transaction: jest.Mock<Promise<unknown>, [(tx: FakeTx) => Promise<unknown>]>;
}

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('sharp', () => jest.fn());

/**
 * Cross-tenant regression test for bulk operations.
 *
 * The fake Prisma below implements the where-clause semantics the service
 * actually uses (id lists + userId / batch-relation predicates) against an
 * in-memory store. If a bulk write ever goes back to using the raw request
 * IDs without the ownership predicate, this fake will happily apply it to
 * the other tenant's rows — and the byte-identical assertions will fail.
 */
describe('BatchService.clearAIContentBulk tenant isolation', () => {
  const USER_A = 'user-a';
  const USER_B = 'user-b';

  let db: {
    batches: BatchRow[];
    contents: ContentRow[];
    assets: AssetRow[];
  };

  function seed() {
    db = {
      batches: [
        { id: 'batch-a1', userId: USER_A, extractedData: { price: 1850 } },
        {
          id: 'batch-b1',
          userId: USER_B,
          extractedData: { price: 9999, secret: 'B data' },
        },
      ],
      contents: [
        {
          id: 'content-a1',
          batchId: 'batch-a1',
          instagramCaption: 'A caption',
        },
        {
          id: 'content-b1',
          batchId: 'batch-b1',
          instagramCaption: 'B caption',
        },
      ],
      assets: [
        { id: 'asset-a1', batchId: 'batch-a1', ocrConfidence: 0.9 },
        { id: 'asset-b1', batchId: 'batch-b1', ocrConfidence: 0.42 },
      ],
    };
  }

  function batchById(id: string) {
    return db.batches.find((b) => b.id === id);
  }

  function makePrisma(): FakePrisma {
    const impl: FakeTx = {
      productBatch: {
        findMany: jest.fn(({ where, include }) =>
          Promise.resolve(
            db.batches
              .filter(
                (b) =>
                  (!where.id?.in || where.id.in.includes(b.id)) &&
                  (!where.userId || b.userId === where.userId),
              )
              .map((b) => ({
                ...b,
                generatedContent: include?.generatedContent
                  ? db.contents.find((c) => c.batchId === b.id) || null
                  : undefined,
              })),
          ),
        ),
        updateMany: jest.fn(({ where, data }) => {
          let count = 0;
          for (const b of db.batches) {
            if (where.id?.in && !where.id.in.includes(b.id)) continue;
            if (where.userId && b.userId !== where.userId) continue;
            Object.assign(b, data);
            count++;
          }
          return Promise.resolve({ count });
        }),
      },
      generatedContent: {
        deleteMany: jest.fn(({ where }) => {
          const before = db.contents.length;
          db.contents = db.contents.filter((c) => {
            if (where.id?.in && !where.id.in.includes(c.id)) return true;
            if (where.batch?.userId) {
              const owner = batchById(c.batchId)?.userId;
              if (owner !== where.batch.userId) return true;
            }
            return false;
          });
          return Promise.resolve({ count: before - db.contents.length });
        }),
      },
      mediaAsset: {
        updateMany: jest.fn(({ where, data }) => {
          let count = 0;
          for (const a of db.assets) {
            if (where.batchId?.in && !where.batchId.in.includes(a.batchId))
              continue;
            if (
              where.batch?.userId &&
              batchById(a.batchId)?.userId !== where.batch.userId
            )
              continue;
            Object.assign(a, data);
            count++;
          }
          return Promise.resolve({ count });
        }),
      },
    };
    return {
      ...impl,
      $transaction: jest.fn((fn) => fn(impl)),
    };
  }

  function makeService(prisma: FakePrisma) {
    return new BatchService(
      prisma as unknown as PrismaService,
      {
        get: (_k: string, def: unknown) => def,
      } as unknown as ConfigService,
      {} as unknown as AiService,
      {} as unknown as OcrService,
      {} as unknown as StorageService,
      { add: jest.fn() } as unknown as Queue<ProcessBatchJob>,
      { add: jest.fn() } as unknown as Queue<IncomingMessagePayload>,
      { add: jest.fn() } as unknown as Queue<BlurImageJob>,
    );
  }

  it('mixed-ownership ID list: only the caller’s batches are modified, the other tenant is byte-identical', async () => {
    seed();
    const prisma = makePrisma();
    const service = makeService(prisma);

    const bSnapshotBefore = JSON.stringify({
      batch: db.batches.find((b) => b.id === 'batch-b1'),
      content: db.contents.find((c) => c.batchId === 'batch-b1'),
      asset: db.assets.find((a) => a.batchId === 'batch-b1'),
    });

    // User A submits a list containing BOTH their own and user B's batch ID.
    const res = (await service.clearAIContentBulk(
      ['batch-a1', 'batch-b1'],
      USER_A,
    )) as { success: boolean; count?: number };
    expect(res.success).toBe(true);
    expect(res.count).toBe(1); // only A's batch was in the working set

    // A's data was cleared.
    expect(
      db.batches.find((b) => b.id === 'batch-a1')!.extractedData,
    ).not.toEqual({
      price: 1850,
    });
    expect(db.contents.find((c) => c.batchId === 'batch-a1')).toBeUndefined();
    expect(
      db.assets.find((a) => a.batchId === 'batch-a1')!.ocrConfidence,
    ).toBeNull();

    // B's rows are byte-identical.
    const bSnapshotAfter = JSON.stringify({
      batch: db.batches.find((b) => b.id === 'batch-b1'),
      content: db.contents.find((c) => c.batchId === 'batch-b1'),
      asset: db.assets.find((a) => a.batchId === 'batch-b1'),
    });
    expect(bSnapshotAfter).toBe(bSnapshotBefore);
  });

  it('a request containing ONLY another tenant’s IDs changes nothing', async () => {
    seed();
    const prisma = makePrisma();
    const service = makeService(prisma);
    const before = JSON.stringify(db);
    const res = (await service.clearAIContentBulk(['batch-b1'], USER_A)) as {
      success: boolean;
      count?: number;
    };
    expect(res.success).toBe(false);
    expect(JSON.stringify(db)).toBe(before);
  });
});
