// seedMock.js — backfill N days of price history (uses the mock scraper unless a
// real FIRECRAWL_API_KEY is set). Lets the charts show a trend immediately.
// Usage: node seedMock.js [days]   e.g. node seedMock.js 30
import "dotenv/config";
import { sourcesFor } from "./devices.js";
import { scrapePrice } from "./firecrawl.js";
import { load, save, upsert } from "./store.js";
import { getCatalog } from "./catalog.js";

const days = parseInt(process.argv[2] || "30", 10);

function dateNDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function avg(sources) {
  const g = sources.filter(s => typeof s.price === "number");
  return g.length ? Math.round(g.reduce((a, s) => a + s.price, 0) / g.length) : null;
}

const db = load();
const catalog = getCatalog(db);
for (let n = days; n >= 0; n--) {
  const date = dateNDaysAgo(n);
  for (const d of catalog) {
    // seed deterministic per-day variation by temporarily pinning Date via salt
    const sources = await Promise.all(sourcesFor(d).map(src =>
      scrapePrice({ ...src }, { ...d, _seedDate: date })));
    const a = avg(sources);
    if (a == null) continue;
    upsert(db, d.id, { date, avg: a, sources: sources.map(s => ({ store: s.store, price: s.price, buyUrl: s.buyUrl, inStock: s.inStock })) });
  }
}
save(db);
console.log(`Seeded ${days + 1} days for ${catalog.length} devices.`);
