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
 * Price-revision consistency (service leg): PATCH /api/batches/:id/price
 * (BatchService.setManualPrice) is the single writer of the recorded
 * price decision. When the review page's entered price differs from
 * the stored structured selling price, it records the new value as
 * manual_price_override AND mirrors it into selling_price /
 * selling_price_value, so the stored decision, the review captions,
 * and the publish gate all read one and the same revision.
 */
describe('BatchService.setManualPrice — recorded price revision', () => {
  let store: any;
  let prisma: any;
  let service: BatchService;

  function setup(extractedData: any) {
    store = {
      id: 'batch-1',
      userId: 'user-1',
      extractedData: JSON.parse(JSON.stringify(extractedData)),
    };
    prisma = {
      productBatch: {
        findUnique: jest.fn(async () => store),
        update: jest.fn(async ({ data }: any) => {
          Object.assign(store, data);
          return store;
        }),
      },
    };
    service = new BatchService(
      prisma,
      { get: (_k: string, def: any) => def } as any, // ConfigService
      {} as any, // AiService
      {} as any, // OcrService
      {} as any, // StorageService
      { add: jest.fn() } as any, // batch queue
      { add: jest.fn() } as any, // history queue
      { add: jest.fn() } as any, // blur queue
    );
  }

  it('editing a derived price (2400 → 2500) records the override and mirrors it into the structured selling price', async () => {
    setup({
      price: 'Rs. 1,850',
      selling_price: 'Rs. 2,400',
      selling_price_value: 2400,
    });
    const result = await service.setManualPrice('batch-1', 'user-1', 2500);
    expect(result).toEqual({ success: true, price: 2500 });
    expect(store.extractedData.manual_price_override).toBe(2500);
    expect(store.extractedData.selling_price_value).toBe(2500);
    expect(store.extractedData.selling_price).toBe('Rs. 2,500');
  });

  it('recording a price for an ambiguous batch clears the needs-review flags', async () => {
    setup({
      price: '2 pcs 1850',
      price_needs_review: true,
      price_ambiguity: 'quantity',
    });
    const result = await service.setManualPrice('batch-1', 'user-1', 3000);
    expect(result.success).toBe(true);
    expect(store.extractedData.manual_price_override).toBe(3000);
    expect(store.extractedData.price_needs_review).toBeUndefined();
    expect(store.extractedData.price_ambiguity).toBeUndefined();
  });

  it('rejects non-positive prices and other tenants’ batches', async () => {
    setup({ price: 'Rs. 1,850', selling_price_value: 2400 });
    expect(await service.setManualPrice('batch-1', 'user-1', 0)).toEqual({
      success: false,
      message: 'A positive price is required',
    });
    prisma.productBatch.findUnique.mockResolvedValue(null);
    expect(await service.setManualPrice('batch-1', 'user-2', 2500)).toEqual({
      success: false,
      message: 'Batch not found',
    });
  });
});
