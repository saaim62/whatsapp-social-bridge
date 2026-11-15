import { BatchProcessor } from './batch.processor';
import type { PrismaService } from '../prisma/prisma.service';
import type { AiService } from '../ai/ai.service';
import type { SocialService } from '../social/social.service';
import type { ConfigService } from '@nestjs/config';

interface Captions {
  instagramCaption: string;
  facebookCaption: string;
  storyText: string;
}

interface TestBatch {
  id: string;
  userId: string;
  extractedData: Record<string, unknown>;
  mediaAssets: unknown[];
  generatedContent: Captions;
}

interface BatchUpdateArg {
  data: { status?: string };
}

interface PublicationData {
  platform?: string;
  status?: string;
  publishedKey?: string | null;
  platformPostId?: string;
}

interface PublicationUpdateManyArg {
  where: { batchId: string; platform: string; status: string };
  data: { status: string; publishedKey: string | null };
}

interface NotificationCreateArg {
  data: { title: string; link?: string };
}

interface SavedDestination {
  pageId: string;
  pageName: string;
  igAccountId: string;
  igUsername: string;
}

type AsyncMock<Args extends unknown[], Result> = jest.Mock<
  Promise<Result>,
  Args
>;

interface PrismaMock {
  productBatch: {
    update: AsyncMock<[BatchUpdateArg], unknown>;
    updateMany: AsyncMock<[unknown], { count: number }>;
    findUnique: AsyncMock<[unknown], TestBatch>;
  };
  settings: {
    findUnique: AsyncMock<
      [unknown],
      {
        marginType: string;
        marginValue: number;
        priceRounding: number;
        captionFooter: string | null;
      }
    >;
  };
  notification: { create: AsyncMock<[NotificationCreateArg], unknown> };
  publication: {
    create: AsyncMock<[{ data: PublicationData }], unknown>;
    findMany: AsyncMock<[unknown], unknown[]>;
    updateMany: AsyncMock<[PublicationUpdateManyArg], { count: number }>;
  };
  $transaction: jest.Mock<Promise<unknown>, [unknown]>;
}

interface SocialMock {
  publishInstagram: AsyncMock<[TestBatch], { id: string }>;
  publishFacebook: AsyncMock<[TestBatch], { id: string }>;
  publishInstagramStory: AsyncMock<[TestBatch], { id: string }>;
  publishFacebookStory: AsyncMock<[TestBatch], { id: string }>;
  getSavedDestination: AsyncMock<[], SavedDestination | null>;
}

/** The private publish entry point, exercised directly by this suite. */
interface ProcessorInternals {
  handlePublishBatch: (
    batchId: string,
    targets?: string[],
    force?: boolean,
  ) => Promise<void>;
}

describe('BatchProcessor publish price gate', () => {
  let prisma: PrismaMock;
  let socialService: SocialMock;
  let processor: BatchProcessor;

  function batchWith(
    extractedData: Record<string, unknown>,
    captions?: Captions,
  ): TestBatch {
    return {
      id: 'batch-1',
      userId: 'user-1',
      extractedData,
      mediaAssets: [],
      generatedContent: captions ?? {
        instagramCaption: 'Beautiful suit — only {{PRICE}}!',
        facebookCaption: 'Beautiful suit — only {{PRICE}}!',
        storyText: 'Only {{PRICE}}',
      },
    };
  }

  function setup(batch: TestBatch) {
    prisma = {
      productBatch: {
        update: jest
          .fn<Promise<unknown>, [BatchUpdateArg]>()
          .mockResolvedValue({}),
        updateMany: jest
          .fn<Promise<{ count: number }>, [unknown]>()
          .mockResolvedValue({ count: 1 }),
        findUnique: jest
          .fn<Promise<TestBatch>, [unknown]>()
          .mockResolvedValue(batch),
      },
      settings: {
        findUnique: jest
          .fn<
            Promise<{
              marginType: string;
              marginValue: number;
              priceRounding: number;
              captionFooter: string | null;
            }>,
            [unknown]
          >()
          .mockResolvedValue({
            marginType: 'PERCENT',
            marginValue: 30,
            priceRounding: 50,
            captionFooter: null,
          }),
      },
      notification: {
        create: jest
          .fn<Promise<unknown>, [NotificationCreateArg]>()
          .mockResolvedValue({}),
      },
      publication: {
        create: jest
          .fn<Promise<unknown>, [{ data: PublicationData }]>()
          .mockResolvedValue({}),
        findMany: jest
          .fn<Promise<unknown[]>, [unknown]>()
          .mockResolvedValue([]),
        updateMany: jest
          .fn<Promise<{ count: number }>, [PublicationUpdateManyArg]>()
          .mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn<Promise<unknown>, [unknown]>((ops: unknown) =>
        Array.isArray(ops)
          ? Promise.all(ops as Array<Promise<unknown>>)
          : Promise.resolve(ops),
      ),
    };
    socialService = {
      publishInstagram: jest
        .fn<Promise<{ id: string }>, [TestBatch]>()
        .mockResolvedValue({ id: 'ig-1' }),
      publishFacebook: jest
        .fn<Promise<{ id: string }>, [TestBatch]>()
        .mockResolvedValue({ id: 'fb-1' }),
      publishInstagramStory: jest
        .fn<Promise<{ id: string }>, [TestBatch]>()
        .mockResolvedValue({ id: 'igs-1' }),
      publishFacebookStory: jest
        .fn<Promise<{ id: string }>, [TestBatch]>()
        .mockResolvedValue({ id: 'fbs-1' }),
      // A destination is saved by default so the price-gate tests reach
      // the publish step; the destination-gate test overrides this.
      getSavedDestination: jest
        .fn<Promise<SavedDestination | null>, []>()
        .mockResolvedValue({
          pageId: 'page-1',
          pageName: 'My Shop',
          igAccountId: 'ig-acc-1',
          igUsername: 'myshop',
        }),
    };
    processor = new BatchProcessor(
      prisma as unknown as PrismaService,
      {} as unknown as AiService,
      socialService as unknown as SocialService,
      {
        get: (_k: string, def: unknown) => def,
      } as unknown as ConfigService,
    );
  }

  function publish() {
    return (processor as unknown as ProcessorInternals).handlePublishBatch(
      'batch-1',
      ['INSTAGRAM', 'FACEBOOK'],
    );
  }

  function statusUpdates() {
    return prisma.productBatch.update.mock.calls.map((c) => c[0].data.status);
  }

  it('IDEMPOTENT RETRY: Instagram already PUBLISHED, Facebook failed before → retry attempts Facebook only', async () => {
    setup(batchWith({ price: 'Rs. 1,850' }));
    prisma.publication.findMany.mockResolvedValue([
      {
        id: 'pub-ig',
        batchId: 'batch-1',
        platform: 'INSTAGRAM',
        status: 'PUBLISHED',
        publishedKey: 'batch-1:INSTAGRAM',
      },
      {
        id: 'pub-fb',
        batchId: 'batch-1',
        platform: 'FACEBOOK',
        status: 'FAILED',
        publishedKey: null,
      },
    ]);
    await publish();
    expect(socialService.publishInstagram).not.toHaveBeenCalled();
    expect(socialService.publishFacebook).toHaveBeenCalledTimes(1);
    // The skipped destination counts as success: the batch completes.
    expect(statusUpdates()).toContain('PUBLISHED');
    // The new Facebook record is the live one for its destination.
    const fbCreate = prisma.publication.create.mock.calls
      .map((c) => c[0].data)
      .find((d) => d.platform === 'FACEBOOK' && d.status === 'PUBLISHED');
    expect(fbCreate?.publishedKey).toBe('batch-1:FACEBOOK');
  });

  it('CLAIM: a second publish job while one is in flight (claim count 0) is a complete no-op', async () => {
    setup(batchWith({ price: 'Rs. 1,850' }));
    prisma.productBatch.updateMany.mockResolvedValue({ count: 0 });
    await publish();
    expect(socialService.publishInstagram).not.toHaveBeenCalled();
    expect(socialService.publishFacebook).not.toHaveBeenCalled();
    expect(prisma.publication.create).not.toHaveBeenCalled();
    expect(prisma.productBatch.update).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('FORCE re-publish: posts to Instagram again, supersedes the old record, writes a new live record', async () => {
    setup(batchWith({ price: 'Rs. 1,850' }));
    prisma.publication.findMany.mockResolvedValue([
      {
        id: 'pub-ig',
        batchId: 'batch-1',
        platform: 'INSTAGRAM',
        status: 'PUBLISHED',
        publishedKey: 'batch-1:INSTAGRAM',
      },
    ]);
    await (processor as unknown as ProcessorInternals).handlePublishBatch(
      'batch-1',
      ['INSTAGRAM'],
      true,
    );
    expect(socialService.publishInstagram).toHaveBeenCalledTimes(1);
    // Old live record superseded (status + key cleared) inside a transaction.
    const supersede = prisma.publication.updateMany.mock.calls[0][0];
    expect(supersede.where).toEqual({
      batchId: 'batch-1',
      platform: 'INSTAGRAM',
      status: 'PUBLISHED',
    });
    expect(supersede.data.status).toBe('SUPERSEDED');
    expect(supersede.data.publishedKey).toBeNull();
    expect(prisma.$transaction).toHaveBeenCalled();
    const newRecord = prisma.publication.create.mock.calls
      .map((c) => c[0].data)
      .find((d) => d.platform === 'INSTAGRAM' && d.status === 'PUBLISHED');
    expect(newRecord?.publishedKey).toBe('batch-1:INSTAGRAM');
    expect(newRecord?.platformPostId).toBe('ig-1');
  });

  it('BLOCKS publishing when no Meta destination is saved — social publish methods never called, batch returns to APPROVED with a notification', async () => {
    setup(batchWith({ price: 'Rs. 1,850' }));
    socialService.getSavedDestination.mockResolvedValue(null);
    await publish();
    expect(socialService.publishInstagram).not.toHaveBeenCalled();
    expect(socialService.publishFacebook).not.toHaveBeenCalled();
    expect(statusUpdates()).toContain('APPROVED');
    expect(statusUpdates()).not.toContain('PUBLISHED');
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    const note = prisma.notification.create.mock.calls[0][0].data;
    expect(note.title).toContain('no destination selected');
    expect(note.link).toBe('/settings');
  });

  it('BLOCKS publishing when the supplier price is a pack quantity ("2 pcs 1850")', async () => {
    setup(batchWith({ price: '2 pcs 1850' }));
    await publish();
    expect(socialService.publishInstagram).not.toHaveBeenCalled();
    expect(socialService.publishFacebook).not.toHaveBeenCalled();
    // Sent back to the review queue, and the user is told.
    expect(statusUpdates()).toContain('READY');
    expect(statusUpdates()).not.toContain('PUBLISHED');
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('BLOCKS publishing when the supplier price is a range ("PKR 1,850–2,450")', async () => {
    setup(batchWith({ price: 'PKR 1,850–2,450' }));
    await publish();
    expect(socialService.publishInstagram).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('BLOCKS publishing when a stored selling_price_value is 0 (legacy bad data)', async () => {
    setup(batchWith({ price: 'Price not specified', selling_price_value: 0 }));
    await publish();
    expect(socialService.publishInstagram).not.toHaveBeenCalled();
    expect(statusUpdates()).toContain('READY');
  });

  it('publishes normally with a clean price ("Rs. 1,850" → Rs. 2,400 in captions)', async () => {
    const batch = batchWith({ price: 'Rs. 1,850' });
    setup(batch);
    await publish();
    expect(socialService.publishInstagram).toHaveBeenCalledTimes(1);
    const publishedBatch = socialService.publishInstagram.mock.calls[0][0];
    expect(publishedBatch.generatedContent.instagramCaption).toContain(
      'Rs. 2,400',
    );
    expect(publishedBatch.generatedContent.instagramCaption).not.toContain(
      '{{PRICE}}',
    );
    expect(statusUpdates()).toContain('PUBLISHED');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('an explicit manual price override unblocks an ambiguous batch and is the price used', async () => {
    const batch = batchWith({
      price: '2 pcs 1850',
      manual_price_override: 3000,
    });
    setup(batch);
    await publish();
    expect(socialService.publishInstagram).toHaveBeenCalledTimes(1);
    const publishedBatch = socialService.publishInstagram.mock.calls[0][0];
    expect(publishedBatch.generatedContent.instagramCaption).toContain(
      'Rs. 3,000',
    );
    expect(statusUpdates()).toContain('PUBLISHED');
  });

  it('BLOCKS an ambiguous batch whose captions were pre-substituted by the review page, when no override was recorded', async () => {
    // The review page used to pre-fill its price field from the raw
    // supplier text and substitute it into the captions before
    // approval — so this batch arrives with no {{PRICE}} placeholder
    // and a price nobody consciously chose. A rendered caption is not
    // a price decision.
    const batch = batchWith(
      { price: '2 pcs 1850' },
      {
        instagramCaption: 'Beautiful suit — only Rs. 2,999!',
        facebookCaption: 'Beautiful suit — only Rs. 2,999!',
        storyText: 'Rs. 2,999',
      },
    );
    setup(batch);
    await publish();
    expect(socialService.publishInstagram).not.toHaveBeenCalled();
    expect(socialService.publishFacebook).not.toHaveBeenCalled();
    expect(statusUpdates()).toContain('READY');
    expect(statusUpdates()).not.toContain('PUBLISHED');
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('the same pre-substituted ambiguous batch publishes once an explicit override is recorded', async () => {
    const batch = batchWith(
      { price: '2 pcs 1850', manual_price_override: 2999 },
      {
        instagramCaption: 'Beautiful suit — only Rs. 2,999!',
        facebookCaption: 'Beautiful suit — only Rs. 2,999!',
        storyText: 'Rs. 2,999',
      },
    );
    setup(batch);
    await publish();
    expect(socialService.publishInstagram).toHaveBeenCalledTimes(1);
    expect(statusUpdates()).toContain('PUBLISHED');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('BLOCKS publishing when an ambiguous price carries a stale POSITIVE selling_price_value and no override', async () => {
    // Processed by the old guessing parser: "2 pcs 1850" was stored
    // with a calculated selling price. The stale value must not rescue
    // the batch — only a human override may.
    setup(
      batchWith({
        price: '2 pcs 1850',
        selling_price: 'Rs. 2,400',
        selling_price_value: 2400,
      }),
    );
    await publish();
    expect(socialService.publishInstagram).not.toHaveBeenCalled();
    expect(socialService.publishFacebook).not.toHaveBeenCalled();
    expect(statusUpdates()).toContain('READY');
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('a manual override wins over the derived price (derived 2400, override 2500 → publishes at 2500)', async () => {
    const batch = batchWith({
      price: 'Rs. 1,850',
      manual_price_override: 2500,
    });
    setup(batch);
    await publish();
    expect(socialService.publishInstagram).toHaveBeenCalledTimes(1);
    const publishedBatch = socialService.publishInstagram.mock.calls[0][0];
    expect(publishedBatch.generatedContent.instagramCaption).toContain(
      'Rs. 2,500',
    );
    expect(publishedBatch.generatedContent.instagramCaption).not.toContain(
      'Rs. 2,400',
    );
    expect(statusUpdates()).toContain('PUBLISHED');
  });

  it('BLOCKS a batch with no price at all and no override, even with placeholder-free captions', async () => {
    const batch = batchWith(
      { price: 'Price not specified' },
      {
        instagramCaption: 'New arrival — DM for details!',
        facebookCaption: 'New arrival — DM for details!',
        storyText: 'New arrival',
      },
    );
    setup(batch);
    await publish();
    expect(socialService.publishInstagram).not.toHaveBeenCalled();
    expect(statusUpdates()).toContain('READY');
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });
});
