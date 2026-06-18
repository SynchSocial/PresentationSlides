// ebay.js — eBay active-listing prices via the Browse API, with the same
// auto-vetting we use elsewhere (right device, sane price, reputable seller).
//
// Auth: client-credentials (application) OAuth grant — App token, scope
// `api_scope` — exactly the flow in the uploaded Analytics spec. Inert mock
// until EBAY_CLIENT_ID + EBAY_CLIENT_SECRET are set.
//
// Sold/completed listings (the Marketplace Insights API,
// sell.marketplace.insights.readonly) are a later add: they need eBay's
// approval and a user-token (authorization-code) flow. Hook is noted below.

import { modelTokens } from "./vetting.js";

const CLIENT_ID = process.env.EBAY_CLIENT_ID;
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const MOCK = !(CLIENT_ID && CLIENT_SECRET) || process.env.MOCK === "1";
const MARKETPLACE = process.env.EBAY_MARKETPLACE || "EBAY_US";
const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const ANALYTICS_URL = "https://api.ebay.com/developer/analytics/v1_beta/rate_limit/";
const API_SCOPE = "https://api.ebay.com/oauth/api_scope";
// A pinned eBay listing must come from a seller at least this reputable.
const MIN_FEEDBACK_PCT = Number(process.env.EBAY_MIN_FEEDBACK_PCT || 95);   // % positive
const MIN_FEEDBACK_SCORE = Number(process.env.EBAY_MIN_FEEDBACK_SCORE || 50); // # feedback

export const isEbayLive = () => !MOCK;

function hash(str) { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ── OAuth (client-credentials app token, cached until expiry) ────────────────
let _token = null, _exp = 0;
async function appToken() {
  if (_token && Date.now() < _exp) return _token;
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: API_SCOPE }),
  });
  if (!res.ok) throw new Error(`eBay OAuth ${res.status}`);
  const j = await res.json();
  _token = j.access_token;
  _exp = Date.now() + ((j.expires_in || 7200) - 60) * 1000;
  return _token;
}

// Vet one Browse item_summary for a device. Returns a quote or null.
export function vetEbayItem(item, device) {
  const title = norm(item.title);
  if (modelTokens(device).some(t => !title.includes(t))) return null; // wrong device
  const price = Number(item.price?.value);
  if (!(price > 0)) return null;
  const msrp = device.msrp || 0;
  if (msrp && (price > msrp * 1.6 || price < msrp * 0.4)) return null; // markup / accessory
  const fb = Number(item.seller?.feedbackPercentage);
  const score = Number(item.seller?.feedbackScore);
  if (!(fb >= MIN_FEEDBACK_PCT) || !(score >= MIN_FEEDBACK_SCORE)) return null; // weak seller
  return {
    price: Math.round(price),
    buyUrl: item.itemWebUrl,
    seller: item.seller?.username,
    feedback: fb,
    condition: item.condition,
  };
}

// Best vetted eBay active listing for a device, as a source-shaped quote.
export async function ebayPrice(device) {
  const store = "eBay";
  if (MOCK) {
    const price = 45 + (hash(device.name) % 320);
    return { store, price, buyUrl: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(device.name)}`, inStock: true, mock: true };
  }
  try {
    const token = await appToken();
    const url = `${BROWSE_URL}?q=${encodeURIComponent(device.name)}&filter=conditions:{NEW|USED}&sort=price&limit=30`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE } });
    if (!res.ok) throw new Error(`eBay Browse ${res.status}`);
    const j = await res.json();
    for (const item of j.itemSummaries || []) {
      const v = vetEbayItem(item, device);
      if (v) return { store, ...v, inStock: true };
    }
    return { store, price: null, buyUrl: null, inStock: false }; // nothing trustworthy
  } catch (e) {
    return { store, price: null, buyUrl: null, inStock: null, error: String(e.message || e) };
  }
}

// Confirm the credentials work + see quota (Analytics API from the uploaded spec).
export async function ebayRateLimits() {
  if (MOCK) return { mock: true, note: "set EBAY_CLIENT_ID/SECRET to go live" };
  const token = await appToken();
  const res = await fetch(`${ANALYTICS_URL}?api_context=buy&api_name=browse`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`eBay Analytics ${res.status}`);
  return res.json();
}

// TODO (after Marketplace Insights approval): ebaySoldPrice(device) using
// /buy/marketplace_insights/v1_beta/item_sales/search with a user token +
// sell.marketplace.insights.readonly scope, vetted the same way.
