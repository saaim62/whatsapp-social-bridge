import { BatchProcessor } from './batch.processor';

/**
 * Publish price-safety gate: a batch whose selling price computes to 0
 * or null must never reach Meta — unless the user set an explicit
 * manual price override on the batch.
 */
describe('BatchProcessor publish price gate', () => {
  let prisma: any;
  let socialService: any;
  let processor: BatchProcessor;

  function batchWith(extractedData: any, captions?: any) {
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

  function setup(batch: any) {
    prisma = {
      productBatch: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(batch),
      },
      settings: {
        findUnique: jest.fn().mockResolvedValue({
          marginType: 'PERCENT',
          marginValue: 30,
          priceRounding: 50,
          captionFooter: null,
        }),
      },
      notification: { create: jest.fn().mockResolvedValue({}) },
      publication: { create: jest.fn().mockResolvedValue({}) },
    };
    socialService = {
      publishInstagram: jest.fn().mockResolvedValue({ id: 'ig-1' }),
      publishFacebook: jest.fn().mockResolvedValue({ id: 'fb-1' }),
      publishInstagramStory: jest.fn().mockResolvedValue({ id: 'igs-1' }),
      publishFacebookStory: jest.fn().mockResolvedValue({ id: 'fbs-1' }),
    };
    processor = new BatchProcessor(prisma, {} as any, socialService, {
      get: (_k: string, def: any) => def,
    } as any);
  }

  function publish() {
    return (processor as any).handlePublishBatch('batch-1', ['INSTAGRAM', 'FACEBOOK']);
  }

  function statusUpdates() {
    return prisma.productBatch.update.mock.calls.map((c: any) => c[0].data.status);
  }

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
    expect(publishedBatch.generatedContent.instagramCaption).toContain('Rs. 2,400');
    expect(publishedBatch.generatedContent.instagramCaption).not.toContain('{{PRICE}}');
    expect(statusUpdates()).toContain('PUBLISHED');
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('an explicit manual price override unblocks an ambiguous batch and is the price used', async () => {
    const batch = batchWith({ price: '2 pcs 1850', manual_price_override: 3000 });
    setup(batch);
    await publish();
    expect(socialService.publishInstagram).toHaveBeenCalledTimes(1);
    const publishedBatch = socialService.publishInstagram.mock.calls[0][0];
    expect(publishedBatch.generatedContent.instagramCaption).toContain('Rs. 3,000');
    expect(statusUpdates()).toContain('PUBLISHED');
  });

  it('captions the user already committed (no placeholder) are published as-is, never blocked', async () => {
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
    expect(socialService.publishInstagram).toHaveBeenCalledTimes(1);
    expect(statusUpdates()).toContain('PUBLISHED');
  });
});
