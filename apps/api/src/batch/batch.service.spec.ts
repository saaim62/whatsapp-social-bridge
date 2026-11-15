import { BatchService } from './batch.service';

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
    batches: any[];
    contents: any[];
    assets: any[];
  };

  function seed() {
    db = {
      batches: [
        { id: 'batch-a1', userId: USER_A, extractedData: { price: 1850 } },
        { id: 'batch-b1', userId: USER_B, extractedData: { price: 9999, secret: 'B data' } },
      ],
      contents: [
        { id: 'content-a1', batchId: 'batch-a1', instagramCaption: 'A caption' },
        { id: 'content-b1', batchId: 'batch-b1', instagramCaption: 'B caption' },
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

  function makePrisma() {
    const impl = {
      productBatch: {
        findMany: jest.fn(async ({ where, include }: any) => {
          return db.batches
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
            }));
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const b of db.batches) {
            if (where.id?.in && !where.id.in.includes(b.id)) continue;
            if (where.userId && b.userId !== where.userId) continue;
            Object.assign(b, data);
            count++;
          }
          return { count };
        }),
      },
      generatedContent: {
        deleteMany: jest.fn(async ({ where }: any) => {
          const before = db.contents.length;
          db.contents = db.contents.filter((c) => {
            if (where.id?.in && !where.id.in.includes(c.id)) return true;
            if (where.batch?.userId) {
              const owner = batchById(c.batchId)?.userId;
              if (owner !== where.batch.userId) return true;
            }
            return false;
          });
          return { count: before - db.contents.length };
        }),
      },
      mediaAsset: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const a of db.assets) {
            if (where.batchId?.in && !where.batchId.in.includes(a.batchId)) continue;
            if (where.batch?.userId && batchById(a.batchId)?.userId !== where.batch.userId)
              continue;
            Object.assign(a, data);
            count++;
          }
          return { count };
        }),
      },
    };
    return {
      ...impl,
      $transaction: jest.fn(async (fn: any) => fn(impl)),
    };
  }

  function makeService(prisma: any) {
    return new BatchService(
      prisma,
      { get: (_k: string, def: any) => def } as any,
      {} as any,
      {} as any,
      {} as any,
      { add: jest.fn() } as any,
      { add: jest.fn() } as any,
      { add: jest.fn() } as any,
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
    const res: any = await service.clearAIContentBulk(['batch-a1', 'batch-b1'], USER_A);
    expect(res.success).toBe(true);
    expect(res.count).toBe(1); // only A's batch was in the working set

    // A's data was cleared.
    expect(db.batches.find((b) => b.id === 'batch-a1')!.extractedData).not.toEqual({
      price: 1850,
    });
    expect(db.contents.find((c) => c.batchId === 'batch-a1')).toBeUndefined();
    expect(db.assets.find((a) => a.batchId === 'batch-a1')!.ocrConfidence).toBeNull();

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
    const res: any = await service.clearAIContentBulk(['batch-b1'], USER_A);
    expect(res.success).toBe(false);
    expect(JSON.stringify(db)).toBe(before);
  });
});
