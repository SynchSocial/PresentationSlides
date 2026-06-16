// scrapeJob.js — for every device: scrape both sources, average the prices,
// store one data point for today. The "avg" is exactly (sum of source prices /
// number of sources that returned a price). Run via `npm run scrape` or cron.

import "dotenv/config";
import { sourcesFor } from "./devices.js";
import { scrapePrice } from "./firecrawl.js";
import { isKeepaLive, resolveAsin, keepaPrice, amazonUrl } from "./keepa.js";
import { load, save, upsert, today, setDeviceAsin } from "./store.js";
import { getCatalog } from "./catalog.js";

function average(sources) {
  const got = sources.filter(s => typeof s.price === "number");
  if (!got.length) return null;
  return Math.round(got.reduce((a, s) => a + s.price, 0) / got.length);
}

export async function runScrape({ log = true } = {}) {
  const db = load();
  const date = today();
  let ok = 0, fail = 0;

  for (const d of getCatalog(db)) {
    // When Keepa is configured, the Amazon source comes from its API (accurate
    // price + history) instead of scraping Amazon search. Resolve & cache the
    // device's ASIN once, then reuse it on every run.
    let asin = d.asin;
    if (isKeepaLive() && !asin) {
      asin = await resolveAsin(d.name);
      if (asin) setDeviceAsin(db, d.id, asin);
    }
    const sources = await Promise.all(sourcesFor(d).map(src => {
      if (src.store === "Amazon" && isKeepaLive() && asin) return keepaPrice(asin);
      return scrapePrice(src, d);
    }));
    const avg = average(sources);
    if (avg == null) { fail++; if (log) console.log(`✗ ${d.name}: no price`); continue; }
    upsert(db, d.id, {
      date,
      avg,
      sources: sources.map(s => ({ store: s.store, price: s.price, buyUrl: s.buyUrl, inStock: s.inStock })),
    });
    ok++;
    if (log) console.log(`✓ ${d.name}: avg $${avg}  [${sources.map(s => s.price ?? "—").join(" / ")}]`);
  }

  save(db);
  if (log) console.log(`\nDone ${date}: ${ok} updated, ${fail} failed.`);
  return { date, ok, fail };
}

// run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runScrape().then(() => process.exit(0));
}
