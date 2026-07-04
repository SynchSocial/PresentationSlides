// vetting.js — automatically judge an Amazon listing's quality so the tracker
// only ever recommends a legitimate, well-priced listing from the real maker —
// never a reseller bundle, a wrong device, or a marked-up listing. Pure scoring
// over Keepa product objects (no API calls here), so it's deterministic and
// unit-testable. keepa.js layers live seller-feedback vetting on top.

// Keepa CSV/stat type indices.
const T_AMAZON = 0, T_NEW = 1, T_BUYBOX = 18, T_RATING = 16, T_REVIEWS = 17;
// Amazon's own seller ids (sold-by-Amazon = inherently trustworthy).
export const AMAZON_SELLER_IDS = new Set([
  "ATVPDKIKX0DER", "A3P5ROKL5A1OLE", "A1AT7YVPFBWXBL", "A2L77EE7U53NWQ",
]);

const BUNDLE_RX = /\bbundle\b|preinstalled|onion\s?os|with\s+\d+\s*(?:\+?\s*)?games|\bcase\b|\bcover\b|screen\s*protector|carrying|\bskin\b|\bpouch\b|accessor/i;

const toDollars = (cents) => (typeof cents === "number" && cents > 0 ? cents / 100 : null);
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Tokens that must all appear in a candidate's title for it to be the right
// device: the model words (brand stripped), keeping digits to disambiguate
// "Pocket 5" from "Pocket 4".
export function modelTokens(device) {
  const brand = norm(device.brand);
  return norm(device.name)
    .split(" ")
    .filter(t => t && t !== brand)
    .filter(t => t.length >= 2 || /\d/.test(t));
}

function buyBoxSeller(product) {
  const h = product.buyBoxSellerIdHistory || [];
  return h.length ? h[h.length - 1] : (product.stats?.buyBoxSellerId ?? null);
}

// Price from a stats.current array (Buy Box -> Amazon -> New). Sales rank (index
// 3) is deliberately never read here.
export function listingPrice(product) {
  const cur = product.stats?.current || [];
  for (const i of [T_BUYBOX, T_AMAZON, T_NEW]) {
    const d = toDollars(cur[i]);
    if (d != null) return d;
  }
  return null;
}

// Score one candidate listing for a device. Returns
// { asin, price, brand, title, sellerId, score, rejected, reasons }.
export function scoreListing(product, device) {
  const reasons = [];
  const title = norm(product.title);
  const price = listingPrice(product);
  const cur = product.stats?.current || [];
  const rating = cur[T_RATING] > 0 ? cur[T_RATING] / 10 : null; // Keepa stores stars*10
  const reviews = cur[T_REVIEWS] > 0 ? cur[T_REVIEWS] : 0;
  const sellerId = buyBoxSeller(product);
  const soldByAmazon = AMAZON_SELLER_IDS.has(sellerId) || cur[T_AMAZON] > 0;

  const out = { asin: product.asin, price, brand: product.brand || null, title: product.title || null, sellerId };

  // ── Hard rejections ────────────────────────────────────────────────────────
  const tokens = modelTokens(device);
  const missing = tokens.filter(t => !title.includes(t));
  if (missing.length) { reasons.push(`wrong device (missing: ${missing.join(",")})`); return { ...out, score: 0, rejected: true, reasons }; }
  if (product.isAdultProduct) { reasons.push("adult listing"); return { ...out, score: 0, rejected: true, reasons }; }
  if (price == null) { reasons.push("no price"); return { ...out, score: 0, rejected: true, reasons }; }
  const msrp = device.msrp || 0;
  if (msrp && price > msrp * 1.6) { reasons.push(`overpriced ($${price} vs MSRP $${msrp}) — likely reseller/bundle`); return { ...out, score: 0, rejected: true, reasons }; }
  if (msrp && price < msrp * 0.4) { reasons.push(`too cheap ($${price} vs MSRP $${msrp}) — likely accessory/case`); return { ...out, score: 0, rejected: true, reasons }; }
  if (price < 10) { reasons.push("price too low"); return { ...out, score: 0, rejected: true, reasons }; }
  if (BUNDLE_RX.test(product.title || "") && !title.includes("console") && !title.includes("handheld")) {
    reasons.push("accessory listing (case/cover/etc.)"); return { ...out, score: 0, rejected: true, reasons };
  }

  // ── Quality score ──────────────────────────────────────────────────────────
  let score = 50;
  const brandMatch = device.brand && (norm(product.brand).includes(norm(device.brand)) || title.includes(norm(device.brand)));
  if (brandMatch) { score += 30; reasons.push("brand match"); }
  else { score -= 25; reasons.push(`brand mismatch (listing: ${product.brand || "?"})`); }

  if (soldByAmazon) { score += 20; reasons.push("sold by Amazon"); }
  else if (sellerId) { reasons.push(`3rd-party seller ${sellerId}`); }

  if (rating != null) { score += Math.round((rating - 3) * 10); reasons.push(`rating ${rating.toFixed(1)}★`); }
  if (reviews) { score += Math.min(Math.round(reviews / 50), 20); reasons.push(`${reviews} reviews`); }

  if (BUNDLE_RX.test(product.title || "")) { score -= 40; reasons.push("bundle/accessory keywords"); }

  // closeness to the device's expected street price
  const ref = device.street || msrp;
  if (ref) { const pen = Math.min(Math.round((Math.abs(price - ref) / ref) * 20), 20); score -= pen; }

  return { ...out, rating, reviews, soldByAmazon, score, rejected: false, reasons };
}

// Rank candidates; return scored non-rejected listings best-first.
export function rankListings(products, device) {
  return (products || [])
    .map(p => scoreListing(p, device))
    .filter(s => !s.rejected)
    .sort((a, b) => b.score - a.score);
}
