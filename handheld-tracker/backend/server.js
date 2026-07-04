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
import os from "os";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { sourcesFor, scoreOf, screenSpec, SYSTEMS } from "./devices.js";
import { load, history, latest, today } from "./store.js";
import { getCatalog } from "./catalog.js";
import { runScrape } from "./scrapeJob.js";
import { runDiscovery } from "./discover.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
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

// In production, serve the built frontend from this same server so the whole
// app is one service on one port (no CORS / no localhost API URL on the LAN).
// The frontend calls the API at a relative path, so same-origin just works.
const DIST = join(__dirname, "../frontend/dist");
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) return res.sendFile(join(DIST, "index.html"));
    next();
  });
}

// Print the LAN address(es) so it's easy to reach from other devices at home.
function lanUrls(port) {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === "IPv4" && !i.internal) out.push(`http://${i.address}:${port}`);
    }
  }
  return out;
}

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || "0.0.0.0"; // bind all interfaces so the LAN can reach it
app.listen(PORT, HOST, () => {
  const mock = process.env.MOCK === "1" || !process.env.FIRECRAWL_API_KEY;
  console.log(`Handheld tracker on http://localhost:${PORT} (mock=${mock})`);
  for (const u of lanUrls(PORT)) console.log(`  on your network: ${u}`);
  if (!existsSync(DIST)) console.log("  (frontend build not found — run `npm run build` to serve the UI here)");
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
