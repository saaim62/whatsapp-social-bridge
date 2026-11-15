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

/** "Rs. 1,850" / "PKR 2,499" / "1850" -> 1850. Returns null when unparseable. */
export function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/,/g, '');
  // Prefer the number following a currency marker ("Rs." itself
  // contains a dot — a naive digit/dot strip turns 1,850 into 0.185).
  const afterCurrency = cleaned.match(/(?:rs\.?|pkr)\s*(\d+(?:\.\d+)?)/i);
  const anyNumber = cleaned.match(/\d+(?:\.\d+)?/);
  const pick = afterCurrency?.[1] ?? anyNumber?.[0];
  if (!pick) return null;
  const rounded = Math.round(parseFloat(pick));
  return rounded > 0 ? rounded : null;
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
