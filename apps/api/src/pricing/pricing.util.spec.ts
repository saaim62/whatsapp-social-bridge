import { analyzePrice, parsePrice, computeSellingPrice, PricingRule } from './pricing.util';

const RULE_30_PCT_ROUND_50: PricingRule = {
  marginType: 'PERCENT',
  marginValue: 30,
  priceRounding: 50,
};

describe('parsePrice / analyzePrice', () => {
  it('"Rs. 1,850" → 1850, and selling price under 30% + round-to-50 is 2400', () => {
    expect(parsePrice('Rs. 1,850')).toBe(1850);
    expect(computeSellingPrice(parsePrice('Rs. 1,850'), RULE_30_PCT_ROUND_50)).toBe(2400);
  });

  it('plain and currency-prefixed prices still parse', () => {
    expect(parsePrice('1850')).toBe(1850);
    expect(parsePrice('PKR 2,499')).toBe(2499);
    expect(parsePrice(1850)).toBe(1850);
  });

  it('"2 pcs 1850" → null (the quantity is not the price), flagged as quantity ambiguity', () => {
    expect(parsePrice('2 pcs 1850')).toBeNull();
    expect(analyzePrice('2 pcs 1850')).toEqual({
      price: null,
      ambiguous: true,
      reason: 'quantity',
    });
  });

  it('"2-piece suit" → null, flagged as quantity ambiguity', () => {
    expect(parsePrice('2-piece suit')).toBeNull();
    expect(analyzePrice('2-piece suit').reason).toBe('quantity');
  });

  it('"pack of 2 — 1850" → null, flagged as quantity ambiguity', () => {
    expect(parsePrice('pack of 2 — 1850')).toBeNull();
    expect(analyzePrice('pack of 2 — 1850').reason).toBe('quantity');
  });

  it('"PKR 1,850–2,450" → null, flagged as a range (never silently the lower bound)', () => {
    expect(parsePrice('PKR 1,850–2,450')).toBeNull();
    expect(analyzePrice('PKR 1,850–2,450')).toEqual({
      price: null,
      ambiguous: true,
      reason: 'range',
    });
  });

  it('unparseable input → null, not ambiguous', () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('Price not specified')).toBeNull();
    expect(analyzePrice('Price not specified').ambiguous).toBe(false);
  });

  it('computeSellingPrice(null) → null; FIXED margin adds flat', () => {
    expect(computeSellingPrice(null, RULE_30_PCT_ROUND_50)).toBeNull();
    expect(
      computeSellingPrice(1000, { marginType: 'FIXED', marginValue: 500, priceRounding: 0 }),
    ).toBe(1500);
  });
});
