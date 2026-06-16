// keepa.js — Amazon price (and ASIN resolution) via the Keepa API.
// Live when KEEPA_API_KEY is set; deterministic mock otherwise (same pattern as
// firecrawl.js), so the pipeline runs without a key.
//
// Keepa prices are integer CENTS, indexed by price *type*; -1 means "no data".
// stats.current[type]:  0 = AMAZON, 1 = NEW (3rd-party new), 2 = USED,
//                       3 = SALES RANK (NOT a price!), 18 = BUY BOX.
// We treat Buy Box -> Amazon -> New as the buy price, in that order.

const KEY = process.env.KEEPA_API_KEY;
const MOCK = !KEY || process.env.MOCK === "1";
const DOMAIN = process.env.KEEPA_DOMAIN || "1"; // 1 = amazon.com
const BASE = "https://api.keepa.com";

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

// Resolve an Amazon ASIN for a device name (Keepa product search).
export async function resolveAsin(name) {
  if (MOCK) return "B0MOCK" + (hash(name) % 100000).toString(36).toUpperCase().padStart(4, "0");
  try {
    const j = await keepaGet(`/search?type=product&term=${encodeURIComponent(name)}`);
    const first = (j.products || [])[0];
    return first?.asin || null;
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
