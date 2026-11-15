/**
 * One-time backfill: clear unsafe calculated selling prices.
 *
 * Batches processed before the hardened price parser existed can carry
 * selling_price / selling_price_value values that were calculated from
 * AMBIGUOUS supplier price text ("2 pcs 1850", "PKR 1,850–2,450") by a
 * parser that guessed. Those batches must not publish on a guessed
 * price: this script clears the calculated values and flags the batch
 * price_needs_review so the reseller makes an explicit price decision.
 * Batches with a manual_price_override (a human decision) and batches
 * already PUBLISHED / PARTIALLY_PUBLISHED are never touched.
 *
 * DRY-RUN BY DEFAULT — pass --apply to write.
 *
 * Run (from apps/api, with DATABASE_URL set — e.g. inside the api
 * container, where the environment is already loaded):
 *   npx ts-node scripts/backfill-price-review.ts            # dry run
 *   npx ts-node scripts/backfill-price-review.ts --apply    # write
 */
import { PrismaClient, Prisma } from '@prisma/client';
import {
  decidePriceBackfill,
  applyPriceBackfill,
} from '../src/pricing/price-backfill';

/** The JSON column can hold any JSON value; the backfill logic only
 *  operates on plain objects. */
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const batches = await prisma.productBatch.findMany({
      where: { status: { notIn: ['PUBLISHED', 'PARTIALLY_PUBLISHED'] } },
      select: { id: true, status: true, extractedData: true },
      orderBy: { createdAt: 'asc' },
    });

    console.log(
      `Scanning ${batches.length} unpublished batches (${apply ? 'APPLY' : 'DRY RUN'})...`,
    );
    let changed = 0;
    for (const batch of batches) {
      const data = asRecord(batch.extractedData);
      const decision = decidePriceBackfill(data);
      if (decision.action !== 'clear') continue;
      const next = applyPriceBackfill(data);
      const dirty =
        JSON.stringify(next) !== JSON.stringify(batch.extractedData ?? null);
      const priceText = data?.price ?? null;
      console.log(
        `${dirty ? 'CLEAR ' : 'FLAG  '} batch ${batch.id} [${batch.status}] price=${JSON.stringify(priceText)} reason=${decision.reason}`,
      );
      if (dirty) {
        changed++;
        if (apply) {
          await prisma.productBatch.update({
            where: { id: batch.id },
            // 'clear' implies a non-null record (see decidePriceBackfill).
            data: { extractedData: next as Prisma.InputJsonObject },
          });
        }
      }
    }
    console.log(
      `${changed} batch(es) ${apply ? 'updated' : 'would be updated'}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
