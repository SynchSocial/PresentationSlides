// scrapeJob.js — for every device: scrape both sources, average the prices,
// store one data point for today. The "avg" is exactly (sum of source prices /
// number of sources that returned a price). Run via `npm run scrape` or cron.

import "dotenv/config";
import { DEVICES, sourcesFor } from "./devices.js";
import { scrapePrice } from "./firecrawl.js";
import { load, save, upsert, today } from "./store.js";

function average(sources) {
  const got = sources.filter(s => typeof s.price === "number");
  if (!got.length) return null;
  return Math.round(got.reduce((a, s) => a + s.price, 0) / got.length);
}

export async function runScrape({ log = true } = {}) {
  const db = load();
  const date = today();
  let ok = 0, fail = 0;

  for (const d of DEVICES) {
    const sources = await Promise.all(sourcesFor(d).map(src => scrapePrice(src, d)));
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
