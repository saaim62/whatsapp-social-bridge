import { analyzePrice, PriceAmbiguity } from './pricing.util';

/**
 * One-time backfill decision logic for batches processed before the
 * hardened price parser existed.
 *
 * Older batches can carry calculated selling values that were derived
 * from AMBIGUOUS supplier price text ("2 pcs 1850", "PKR 1,850–2,450")
 * by a parser that guessed. Those stored values are unsafe: the publish
 * worker used to fall back to them when the current parse refused to
 * guess. The backfill clears the calculated values on such batches and
 * flags them for a human price decision.
 *
 * An explicit manual_price_override is a human decision, not a
 * calculation — it is never cleared.
 */
export interface PriceBackfillDecision {
  action: 'clear' | 'keep';
  reason?: PriceAmbiguity;
}

export function decidePriceBackfill(
  extractedData: Record<string, unknown> | null | undefined,
): PriceBackfillDecision {
  const data = extractedData ?? {};
  if (
    typeof data.manual_price_override === 'number' &&
    data.manual_price_override > 0
  ) {
    return { action: 'keep' };
  }
  const analysis = analyzePrice(data.price);
  if (analysis.ambiguous) {
    return { action: 'clear', reason: analysis.reason };
  }
  return { action: 'keep' };
}

/** Return the extractedData the backfill should persist for one batch. */
export function applyPriceBackfill(
  extractedData: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const decision = decidePriceBackfill(extractedData);
  if (decision.action !== 'clear' || extractedData == null) {
    return extractedData;
  }
  const next = { ...extractedData };
  delete next.selling_price;
  delete next.selling_price_value;
  next.price_needs_review = true;
  next.price_ambiguity = decision.reason;
  return next;
}
