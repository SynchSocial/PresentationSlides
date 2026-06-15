// server.js — REST API + daily cron.
// GET  /api/devices       -> all devices w/ score, latest avg price, 2 buy links
// GET  /api/history/:id   -> daily averaged price series for one device
// POST /api/refresh       -> trigger a scrape now
// POST /api/discover      -> find + auto-publish newly released handhelds
// GET  /api/health
import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import { sourcesFor, scoreOf, screenSpec, SYSTEMS } from "./devices.js";
import { load, history, latest, today } from "./store.js";
import { getCatalog } from "./catalog.js";
import { runScrape } from "./scrapeJob.js";
import { runDiscovery } from "./discover.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, mock: process.env.MOCK === "1" || !process.env.FIRECRAWL_API_KEY }));

app.get("/api/devices", (_req, res) => {
  const db = load();
  const out = getCatalog(db).map(d => {
    const last = latest(db, d.id);
    const price = last?.avg ?? d.street;
    const fallbackSources = sourcesFor(d).map(s => ({ store: s.store, price: null, buyUrl: s.url }));
    const screen = screenSpec(d);
    return {
      id: d.id, name: d.name, brand: d.brand, chip: d.chip, ram: d.ram, screen: d.screen,
      screenSize: screen.size, resolution: screen.resolution, aspect: screen.aspect,
      form: d.form, os: d.os, tier: d.tier, msrp: d.msrp, hr: d.hr, tracked: !!d.tracked,
      emu: d.emu,
      ...scoreOf(d, price),
      price,
      priceDate: last?.date ?? null,
      sources: last?.sources ?? fallbackSources,
    };
  });
  res.json({ systems: SYSTEMS, updated: out.reduce((m, x) => x.priceDate && x.priceDate > m ? x.priceDate : m, ""), devices: out });
});

app.get("/api/history/:id", (req, res) => {
  const db = load();
  const h = history(db, req.params.id).map(r => ({
    date: r.date,
    avg: r.avg,
    sources: r.sources,
  }));
  res.json({ id: req.params.id, history: h });
});

app.post("/api/refresh", async (_req, res) => {
  const r = await runScrape({ log: false });
  res.json(r);
});

app.post("/api/discover", async (_req, res) => {
  const r = await runDiscovery({ log: false });
  res.json(r);
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Handheld tracker API on :${PORT} (mock=${process.env.MOCK === "1" || !process.env.FIRECRAWL_API_KEY})`);
  const db = load();
  // ensure today's prices exist on boot (covers any device missing today's point)
  const missing = getCatalog(db).some(d => latest(db, d.id)?.date !== today());
  if (missing) runScrape({ log: false }).catch(() => {});
});

// daily price scrape at 09:00 server time
cron.schedule(process.env.CRON || "0 9 * * *", () => {
  console.log("[cron] daily scrape");
  runScrape({ log: false }).catch(e => console.error("scrape failed", e));
});

// weekly discovery sweep — grows the catalog as new handhelds release
cron.schedule(process.env.CRON_DISCOVER || "0 10 * * 1", () => {
  console.log("[cron] weekly discovery");
  runDiscovery({ log: false }).catch(e => console.error("discovery failed", e));
});
