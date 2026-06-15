// firecrawl.js — extract {price, buyUrl, inStock} from a store page/search.
// Uses Firecrawl v2 /scrape JSON format. Falls back to a deterministic mock
// when FIRECRAWL_API_KEY is unset or MOCK=1, so the pipeline runs without a key.

const KEY = process.env.FIRECRAWL_API_KEY;
const MOCK = process.env.MOCK === "1" || !KEY;
const ENDPOINT = "https://api.firecrawl.dev/v2/scrape";

const PRICE_SCHEMA = {
  type: "object",
  properties: {
    price: { type: "number", description: "Current lowest buy price in USD for this exact handheld" },
    inStock: { type: "boolean" },
    buyUrl: { type: "string", description: "Direct product/buy URL for the cheapest listing" },
  },
  required: ["price"],
};

// Deterministic-ish daily jitter so the mock chart actually moves over time.
// Honors device._seedDate (YYYY-MM-DD) when backfilling history.
function mockPrice(name, base, salt, seedDate) {
  const day = seedDate || new Date().toISOString().slice(0, 10);
  let h = 0;
  for (const ch of (name + salt + day)) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  const swing = (h / 1000 - 0.5) * 0.12; // ±6%
  return Math.max(15, Math.round(base * (1 + swing)));
}

export async function scrapePrice(source, device) {
  if (MOCK) {
    return {
      store: source.store,
      price: mockPrice(device.name, device.street, source.store, device._seedDate),
      buyUrl: source.url,
      inStock: true,
      mock: true,
    };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: source.url,
        onlyMainContent: true,
        // "stealth" survives AliExpress/store anti-bot (captcha) walls far more
        // often than "auto" (which resolves to "basic" and gets challenged).
        proxy: "stealth",
        formats: [{
          type: "json",
          prompt: `Find the "${device.name}" retro handheld on this page. Return its current lowest price in USD as a number, whether it is in stock, and the direct product/buy URL for the cheapest listing.`,
          schema: PRICE_SCHEMA,
        }],
      }),
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}`);
    const data = await res.json();
    const j = data?.data?.json || {};
    const price = Number(j.price);
    if (!price || price < 15 || price > device.msrp * 2.5) throw new Error("price out of range");
    return { store: source.store, price: Math.round(price), buyUrl: j.buyUrl || source.url, inStock: j.inStock !== false };
  } catch (e) {
    return { store: source.store, price: null, buyUrl: source.url, inStock: null, error: String(e.message || e) };
  }
}
