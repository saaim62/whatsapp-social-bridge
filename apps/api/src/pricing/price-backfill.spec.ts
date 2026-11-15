import { decidePriceBackfill, applyPriceBackfill } from './price-backfill';

describe('price backfill decision', () => {
  it('clears calculated values stored for a pack-quantity price', () => {
    const data = { price: '2 pcs 1850', selling_price: 'Rs. 2,400', selling_price_value: 2400 };
    expect(decidePriceBackfill(data)).toEqual({ action: 'clear', reason: 'quantity' });
    const next = applyPriceBackfill(data);
    expect(next.selling_price).toBeUndefined();
    expect(next.selling_price_value).toBeUndefined();
    expect(next.price_needs_review).toBe(true);
    expect(next.price_ambiguity).toBe('quantity');
    // The supplier text itself is preserved for the human reviewer.
    expect(next.price).toBe('2 pcs 1850');
  });

  it('clears a zero selling value stored for an ambiguous price', () => {
    const data = { price: '2 pcs 1850', selling_price_value: 0 };
    expect(decidePriceBackfill(data).action).toBe('clear');
    expect(applyPriceBackfill(data).selling_price_value).toBeUndefined();
  });

  it('clears calculated values stored for a price range', () => {
    const data = { price: 'PKR 1,850–2,450', selling_price_value: 2400 };
    expect(decidePriceBackfill(data)).toEqual({ action: 'clear', reason: 'range' });
  });

  it('flags an ambiguous batch even when nothing was stored', () => {
    const next = applyPriceBackfill({ price: '2 pcs 1850' });
    expect(next.price_needs_review).toBe(true);
    expect(next.price_ambiguity).toBe('quantity');
  });

  it('never clears a human price decision (manual override)', () => {
    const data = {
      price: '2 pcs 1850',
      manual_price_override: 3000,
      selling_price: 'Rs. 3,000',
      selling_price_value: 3000,
    };
    expect(decidePriceBackfill(data)).toEqual({ action: 'keep' });
    expect(applyPriceBackfill(data)).toBe(data);
  });

  it('keeps batches whose price parses unambiguously', () => {
    const data = { price: 'Rs. 1,850', selling_price: 'Rs. 2,400', selling_price_value: 2400 };
    expect(decidePriceBackfill(data)).toEqual({ action: 'keep' });
    expect(applyPriceBackfill(data)).toBe(data);
  });

  it('keeps batches with no price text at all', () => {
    expect(decidePriceBackfill({})).toEqual({ action: 'keep' });
    expect(decidePriceBackfill(null)).toEqual({ action: 'keep' });
    expect(applyPriceBackfill(null)).toBeNull();
  });
});
