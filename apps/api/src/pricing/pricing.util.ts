/**
 * Reseller pricing — pure functions, no framework dependencies.
 *
 * The supplier (wholesale) price extracted from a WhatsApp post is NOT
 * the price a reseller publishes. The selling price is derived from
 * the user's margin rule:
 *   PERCENT: supplier * (1 + marginValue / 100)
 *   FIXED:   supplier + marginValue
 * then rounded to the user's rounding step (e.g. nearest Rs. 50).
 *
 * The publish path is the authoritative consumer: it substitutes the
 * selling price into the {{PRICE}} placeholder of every caption at
 * publish time, so NO publish route (single, bulk, queued) can ever
 * ship the supplier price or a raw placeholder.
 */

export interface PricingRule {
  marginType: string; // 'PERCENT' | 'FIXED'
  marginValue: number;
  priceRounding: number; // 0 = no rounding
}

export type PriceAmbiguity = 'range' | 'quantity';

export interface PriceAnalysis {
  /** The single, unambiguous supplier price — or null. */
  price: number | null;
  /**
   * True when the text carries price-like numbers that must NOT be
   * guessed: a range ("PKR 1,850–2,450") or a pack quantity
   * ("2 pcs 1850", "2-piece suit"). Guessing here once turned the
   * quantity into the price and published listings at Rs. 0 — a
   * missing price is recoverable in review, a wrong published price
   * costs the reseller money.
   */
  ambiguous: boolean;
  reason?: PriceAmbiguity;
}

// "pack of 2", "set of 3" leading the string.
const PACK_OF_RE = /^\s*(?:pack|set)\s+of\s+\d+\b/i;
// A leading quantity with a unit word: "2 pcs", "2-piece", "3 pairs".
const QUANTITY_LEAD_RE =
  /^\s*(?:rs\.?|pkr)?\s*\d+\s*[- ]?\s*(pcs?|pieces?|packs?|sets?|pairs?|dozen)\b/i;
// "2 x 1850" — per-piece or total? Unknowable, so ambiguous.
const MULTIPLY_RE = /^\s*\d+\s*[x×]\s*\d+/;
// Two numbers joined by a dash or "to": "1,850–2,450", "1850 to 2450".
const RANGE_RE = /\d[\d,]*\s*(?:[-–—]| to )\s*(?:rs\.?|pkr)?\s*\d[\d,]*/i;

/** Analyze a raw extracted price string without ever guessing. */
export function analyzePrice(raw: unknown): PriceAnalysis {
  if (raw === null || raw === undefined) return { price: null, ambiguous: false };
  const text = String(raw);
  if (!text.trim()) return { price: null, ambiguous: false };

  if (PACK_OF_RE.test(text) || QUANTITY_LEAD_RE.test(text) || MULTIPLY_RE.test(text)) {
    return { price: null, ambiguous: true, reason: 'quantity' };
  }
  if (RANGE_RE.test(text)) {
    return { price: null, ambiguous: true, reason: 'range' };
  }

  const cleaned = text.replace(/,/g, '');
  // Prefer the number following a currency marker ("Rs." itself
  // contains a dot — a naive digit/dot strip turns 1,850 into 0.185).
  const afterCurrency = cleaned.match(/(?:rs\.?|pkr)\s*(\d+(?:\.\d+)?)/i);
  // Next, a number anchored to a price keyword ("price 1850",
  // "Rate: 450", "amount=2400"). The unanchored fallback below takes
  // the FIRST number in the string, which read "Size 42, price 1850"
  // as Rs. 42 — a size, not a price.
  const afterKeyword = cleaned.match(
    /(?:price|rate|cost|amount|rs\.?|pkr)\b[\s:=#-]*(\d+(?:\.\d+)?)/i,
  );
  const anyNumber = cleaned.match(/\d+(?:\.\d+)?/);
  const pick = afterCurrency?.[1] ?? afterKeyword?.[1] ?? anyNumber?.[0];
  if (!pick) return { price: null, ambiguous: false };
  const rounded = Math.round(parseFloat(pick));
  return { price: rounded > 0 ? rounded : null, ambiguous: false };
}

/** "Rs. 1,850" / "PKR 2,499" / "1850" -> 1850. Returns null when unparseable or ambiguous. */
export function parsePrice(raw: unknown): number | null {
  return analyzePrice(raw).price;
}

export function computeSellingPrice(
  supplierPrice: number | null,
  rule: PricingRule,
): number | null {
  if (supplierPrice === null) return null;
  let v =
    rule.marginType === 'FIXED'
      ? supplierPrice + rule.marginValue
      : supplierPrice * (1 + rule.marginValue / 100);
  const r = rule.priceRounding;
  if (r && r > 1) v = Math.round(v / r) * r;
  return Math.max(0, Math.round(v));
}

export function formatRs(n: number): string {
  return `Rs. ${n.toLocaleString('en-US')}`;
}

/**
 * Finalize a caption for publishing: replace every {{PRICE}} with the
 * selling price and append the user's caption footer (once).
 * Idempotent: a caption whose price was already substituted by the
 * review-page commit flow passes through unchanged (no placeholder,
 * footer already present -> no duplication).
 */
export function finalizeCaption(
  caption: string | null | undefined,
  sellingPrice: string,
  footer?: string | null,
  withFooter = true,
): string {
  let out = (caption ?? '').replace(/\{\{PRICE\}\}/g, sellingPrice);
  const f = (footer ?? '').trim();
  if (withFooter && f && !out.includes(f)) {
    out = out.trimEnd() + '\n\n' + f;
  }
  return out;
}
