import { BatchProcessor } from './batch.processor';

/**
 * Publish price-decision gate: a batch may reach Meta only with a real
 * price decision —
 *   (a) a structured selling price > 0 derived from an unambiguous
 *       supplier-price parse, or
 *   (b) an explicit manual_price_override recorded through the
 *       dedicated price-update action (PATCH /api/batches/:id/price).
 * A caption whose {{PRICE}} was already substituted by the review page
 * is NOT a decision: the page once pre-filled its price field from the
 * raw supplier text, so an ambiguous price could be "approved" without
 * the reseller ever choosing one.
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
      // A destination is saved by default so the price-gate tests reach
      // the publish step; the destination-gate test overrides this.
      getSavedDestination: jest.fn().mockResolvedValue({
        pageId: 'page-1',
        pageName: 'My Shop',
        igAccountId: 'ig-acc-1',
        igUsername: 'myshop',
      }),
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
    setup(batchWith({ price: '2 pcs 1850', selling_price: 'Rs. 2,400', selling_price_value: 2400 }));
    await publish();
    expect(socialService.publishInstagram).not.toHaveBeenCalled();
    expect(socialService.publishFacebook).not.toHaveBeenCalled();
    expect(statusUpdates()).toContain('READY');
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('a manual override wins over the derived price (derived 2400, override 2500 → publishes at 2500)', async () => {
    const batch = batchWith({ price: 'Rs. 1,850', manual_price_override: 2500 });
    setup(batch);
    await publish();
    expect(socialService.publishInstagram).toHaveBeenCalledTimes(1);
    const publishedBatch = socialService.publishInstagram.mock.calls[0][0];
    expect(publishedBatch.generatedContent.instagramCaption).toContain('Rs. 2,500');
    expect(publishedBatch.generatedContent.instagramCaption).not.toContain('Rs. 2,400');
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
