// firecrawl.js — extract {price, buyUrl, inStock} from a store page/search,
// plus spec/benchmark extraction used by the self-building discovery job.
// Uses Firecrawl v2 /scrape + /search. Falls back to deterministic mocks when
// FIRECRAWL_API_KEY is unset or MOCK=1, so the whole pipeline runs without a key.

const KEY = process.env.FIRECRAWL_API_KEY;
const MOCK = process.env.MOCK === "1" || !KEY;
const ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const SEARCH_ENDPOINT = "https://api.firecrawl.dev/v2/search";

export const isMock = () => MOCK;

// Small deterministic hash so mocks are stable across runs.
function hash(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

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

// ── Discovery: find newly released handhelds ─────────────────────────────────
// In live mode this runs several Firecrawl web searches (from watchlist's
// DISCOVERY_QUERIES) and unions the device names found; in mock mode it returns
// a deterministic set of "just-released" candidates — including a next-gen
// flagship and a TrimUI-with-sticks device — so the pipeline self-tests.
const MOCK_CANDIDATES = [
  "Anbernic RG477V", "Retroid Pocket 7", "Powkiddy X75", "Miyoo Mini V4",
  "TrimUI Smart Pro 2", "GKD Bubble", "AYANEO Pocket Vert",
  "TrimUI Brick S with Sticks", "AYN Odin 4",        // <- new TrimUI + next-gen flagship
];
const BRAND_RX = /\b(Anbernic|Retroid|Miyoo|Powkiddy|TrimUI|AYANEO|AYN|GKD|MagicX|Mangmi|ModRetro)\s+[A-Za-z0-9][\w\s-]{1,28}/i;

export async function discoverCandidates(queries) {
  if (MOCK) return MOCK_CANDIDATES.map(name => ({ name }));
  const { DISCOVERY_QUERIES } = await import("./watchlist.js");
  const qs = queries && queries.length ? queries : DISCOVERY_QUERIES;
  const names = new Set();
  for (const query of qs) {
    try {
      const res = await fetch(SEARCH_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 15 }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const items = data?.data || data?.results || [];
      for (const it of items) {
        const m = String(it.title || "").match(BRAND_RX);
        if (m) names.add(m[0].replace(/\s+/g, " ").trim());
      }
    } catch { /* skip a failed query, keep the rest */ }
  }
  return [...names].map(name => ({ name }));
}

const SPEC_SCHEMA = {
  type: "object",
  properties: {
    brand: { type: "string" },
    chip: { type: "string", description: "SoC / processor, e.g. 'Unisoc T820'" },
    ram: { type: "string", description: "RAM with unit, e.g. '8GB'" },
    screen: { type: "string", description: "Screen size + resolution, e.g. '4.7\" 1280x960'" },
    form: { type: "string", description: "Form factor: Horizontal / Vertical / Clamshell / etc." },
    os: { type: "string" },
    msrp: { type: "number", description: "Launch MSRP in USD" },
  },
  required: ["chip"],
};

// Deterministic mock specs so discovery is exercisable without a key. Derives
// a plausible chip/RAM/screen/MSRP from the name hash.
function mockSpecs(name) {
  const h = hash(name);
  const chips = [
    ["Allwinner H700", "1GB", '3.5" 640×480', 65],
    ["Unisoc T820", "8GB", '4.7" 1280×960', 165],
    ["Snapdragon 865", "8GB", '4.7" 750p', 199],
    ["MediaTek Dimensity 8300", "12GB", '6.0" 1080p', 299],
    ["Snapdragon 8 Gen 4", "16GB", '6.0" 1080p', 399], // unknown chip -> benchmark path
    ["Rockchip RK3566", "1GB", '4" 720×720', 85],
  ];
  // Named cases so discovery's flagship + TrimUI-with-sticks paths self-test.
  const SPECIAL = {
    "AYN Odin 4": ["Snapdragon 8 Elite Gen 2", "16GB", '6.0" 1080p', 449], // next-gen flagship (watchlist fallback)
    "TrimUI Brick S with Sticks": ["Allwinner A133P", "1GB", '3.2" 1024×768', 95],
  };
  const brandM = name.match(/^(Anbernic|Retroid|Miyoo|Powkiddy|TrimUI|AYANEO|AYN|GKD|MagicX|Mangmi)/i);
  const [chip, ram, screen, msrp] = SPECIAL[name] || chips[h % chips.length];
  return {
    brand: brandM ? brandM[1] : name.split(" ")[0],
    chip, ram, screen, msrp,
    form: ["Horizontal", "Vertical", "Clamshell"][h % 3],
    os: chip.startsWith("Allwinner") || chip.startsWith("Rockchip") ? "Linux" : "Android",
  };
}

export async function scrapeSpecs(name) {
  if (MOCK) return { ...mockSpecs(name), mock: true };
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `https://www.google.com/search?q=${encodeURIComponent(name + " handheld specs")}`,
        onlyMainContent: true,
        proxy: "stealth",
        formats: [{
          type: "json",
          prompt: `Find the specs for the "${name}" retro gaming handheld: processor/SoC, RAM, screen size and resolution, form factor, OS, and launch MSRP in USD.`,
          schema: SPEC_SCHEMA,
        }],
      }),
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}`);
    const data = await res.json();
    return data?.data?.json || {};
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

// AnTuTu-ish benchmark for a SoC, used to place unknown chips on the tier scale.
export async function chipBenchmark(chip) {
  if (MOCK) {
    // Stable pseudo-score in a realistic range, biased up for "newer" chip names.
    const base = 200000 + (hash(chip) % 2200000);
    const bump = /elite|gen 4|gen 5|9\d{3}|x\d/i.test(chip) ? 800000 : 0;
    return Math.min(3000000, base + bump);
  }
  try {
    // Search-scrape the chip's AnTuTu from public benchmark databases
    // (nanoreview, kimovil, etc.) — robust to whatever the SoC's slug is.
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `https://www.google.com/search?q=${encodeURIComponent(`${chip} AnTuTu total score nanoreview`)}`,
        onlyMainContent: true,
        proxy: "stealth",
        formats: [{
          type: "json",
          prompt: `Return the AnTuTu total benchmark score (a single number, e.g. 757199) for the "${chip}" processor. Use the most recent AnTuTu version reported.`,
          schema: { type: "object", properties: { antutu: { type: "number" } }, required: ["antutu"] },
        }],
      }),
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}`);
    const data = await res.json();
    const n = Number(data?.data?.json?.antutu);
    // Sanity-bound so a misparse can't crown a no-name chip as flagship-class.
    return n >= 20000 && n <= 4000000 ? n : null;
  } catch {
    return null;
  }
}
