// keepa.js — Amazon price (and ASIN resolution) via the Keepa API.
// Live when KEEPA_API_KEY is set; deterministic mock otherwise (same pattern as
// firecrawl.js), so the pipeline runs without a key.
//
// Keepa prices are integer CENTS, indexed by price *type*; -1 means "no data".
// stats.current[type]:  0 = AMAZON, 1 = NEW (3rd-party new), 2 = USED,
//                       3 = SALES RANK (NOT a price!), 18 = BUY BOX.
// We treat Buy Box -> Amazon -> New as the buy price, in that order.

import { rankListings, AMAZON_SELLER_IDS } from "./vetting.js";

const KEY = process.env.KEEPA_API_KEY;
const MOCK = !KEY || process.env.MOCK === "1";
const DOMAIN = process.env.KEEPA_DOMAIN || "1"; // 1 = amazon.com
const BASE = "https://api.keepa.com";
// A pinned listing must come from a seller this reputable (skipped for
// sold-by-Amazon). Tunable via env.
const MIN_SELLER_RATING = Number(process.env.KEEPA_MIN_SELLER_RATING || 90); // % positive
const MIN_SELLER_COUNT = Number(process.env.KEEPA_MIN_SELLER_COUNT || 50);   // # ratings

const T_AMAZON = 0, T_NEW = 1, T_BUYBOX = 18;

export const isKeepaLive = () => !MOCK;

const toDollars = (cents) => (typeof cents === "number" && cents > 0 ? Math.round(cents) / 100 : null);
export const amazonUrl = (asin) => `https://www.amazon.com/dp/${asin}`;

function hash(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// Choose a buy price from a Keepa stats.current array.
function pickPrice(current = []) {
  for (const i of [T_BUYBOX, T_AMAZON, T_NEW]) {
    const d = toDollars(current[i]);
    if (d != null) return d;
  }
  return null;
}

// Node's fetch (undici) transparently decompresses Keepa's gzip responses.
async function keepaGet(path) {
  const res = await fetch(`${BASE}${path}&key=${KEY}&domain=${DOMAIN}`);
  if (!res.ok) throw new Error(`Keepa ${res.status}`);
  return res.json();
}

// Look up a seller's feedback history. Returns { rating, count } (percent
// positive + number of ratings) or null.
export async function keepaSeller(sellerId) {
  if (!sellerId || AMAZON_SELLER_IDS.has(sellerId)) return null;
  if (MOCK) { const h = hash(sellerId); return { rating: 88 + (h % 12), count: 50 + (h % 4000) }; }
  try {
    const j = await keepaGet(`/seller?seller=${encodeURIComponent(sellerId)}`);
    const s = (j.sellers || {})[sellerId];
    if (!s) return null;
    // currentRating = % positive (-1 if unknown); currentRatingCount = # ratings.
    const rating = typeof s.currentRating === "number" && s.currentRating >= 0 ? s.currentRating : null;
    const count = typeof s.currentRatingCount === "number" && s.currentRatingCount >= 0 ? s.currentRatingCount : null;
    return { rating, count, name: s.sellerName, shipsFromChina: !!s.shipsFromChina };
  } catch {
    return null;
  }
}

const sellerOk = (s) =>
  s && typeof s.rating === "number" && typeof s.count === "number" &&
  s.rating >= MIN_SELLER_RATING && s.count >= MIN_SELLER_COUNT;

// Who currently holds the Buy Box for an ASIN (search results don't carry this,
// so it needs a per-ASIN product+offers call). Returns { sellerId, isAmazon }.
// Most recent real seller id in a [time, sellerId, ...] history (skips "-1" = no
// buy box).
function lastSeller(history = []) {
  for (let i = history.length - 1; i >= 0; i -= 2) {
    const v = history[i];
    if (v && v !== "-1") return v;
  }
  return null;
}

async function buyBoxSellerOf(asin) {
  if (!asin) return { sellerId: null, isAmazon: false };
  try {
    const j = await keepaGet(`/product?asin=${asin}&offers=20&buybox=1`);
    const p = (j.products || [])[0] || {};
    const sellerId = p.stats?.buyBoxSellerId || lastSeller(p.buyBoxSellerIdHistory);
    const isAmazon = AMAZON_SELLER_IDS.has(sellerId) || !!p.stats?.buyBoxIsAmazon;
    return { sellerId, isAmazon };
  } catch {
    return { sellerId: null, isAmazon: false };
  }
}

// Automatically vet + pick the best Amazon listing for a device: search, score
// each candidate (right device, real brand, sane price, reviews), then confirm
// the buy-box seller is either Amazon or has a good feedback history. Returns
// the chosen listing { asin, price, brand, sellerId, seller, score } or null if
// nothing is trustworthy enough to recommend.
export async function resolveBestListing(name, device) {
  if (MOCK) {
    const asin = "B0MOCK" + (hash(name) % 100000).toString(36).toUpperCase().padStart(4, "0");
    return { asin, price: 40 + (hash(asin) % 360), brand: device?.brand, sellerId: "MOCK", seller: { rating: 97, count: 1200 }, score: 100, mock: true };
  }
  try {
    const j = await keepaGet(`/search?type=product&term=${encodeURIComponent(name)}&stats=180&rating=1`);
    const ranked = rankListings(j.products, device);
    // Check the top few by listing quality; first one whose Buy Box is held by
    // Amazon or a reputable seller wins.
    for (const cand of ranked.slice(0, 3)) {
      const { sellerId, isAmazon } = await buyBoxSellerOf(cand.asin);
      if (isAmazon) return { ...cand, sellerId, seller: { amazon: true } };
      const seller = await keepaSeller(sellerId);
      if (sellerOk(seller)) return { ...cand, sellerId, seller };
    }
    return null; // nothing passed — recommend no Amazon link rather than a bad one
  } catch {
    return null;
  }
}

// Simple (unvetted) ASIN resolver, kept for callers that just want a lookup.
export async function resolveAsin(name) {
  if (MOCK) return "B0MOCK" + (hash(name) % 100000).toString(36).toUpperCase().padStart(4, "0");
  try {
    const j = await keepaGet(`/search?type=product&term=${encodeURIComponent(name)}`);
    return (j.products || [])[0]?.asin || null;
  } catch {
    return null;
  }
}

// Current Amazon buy price for an ASIN. Returns a source-shaped quote object
// (same shape firecrawl.scrapePrice returns) so it drops into the scrape job.
export async function keepaPrice(asin, { store = "Amazon" } = {}) {
  if (!asin) return { store, price: null, buyUrl: null, inStock: null, error: "no asin" };
  if (MOCK) {
    const price = 40 + (hash(asin) % 360); // deterministic stand-in
    return { store, price, buyUrl: amazonUrl(asin), inStock: true, mock: true };
  }
  try {
    const j = await keepaGet(`/product?asin=${asin}&stats=180&history=0`);
    const p = (j.products || [])[0];
    const stats = p?.stats || {};
    const price = pickPrice(stats.current);
    const avg30 = pickPrice(stats.avg30);
    if (price == null) return { store, price: null, buyUrl: amazonUrl(asin), inStock: false, error: "no price" };
    return { store, price: Math.round(price), buyUrl: amazonUrl(asin), inStock: true, avg30, asin };
  } catch (e) {
    return { store, price: null, buyUrl: amazonUrl(asin), inStock: null, error: String(e.message || e) };
  }
}
