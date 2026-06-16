// discover.js — the self-building part of the catalog.
//
// Periodically: find newly released handhelds, scrape their specs, rate the
// processor (known chip -> tuned profile; unknown chip -> benchmark mapped to
// the nearest tier), validate hard, and auto-publish the survivors into the
// ranked catalog. No "unverified" flag — the validation gate is the safety net.

import { discoverCandidates, scrapeSpecs } from "./firecrawl.js";
import { resolveEmu, KNOWN_CHIPS, SYSTEMS, PROFILE_BENCHMARK } from "./devices.js";
import { resolveBenchmark } from "./benchmarks.js";
import { load, getDevice, upsertDevice, upsertChipProfile } from "./store.js";
import { ensureSeeded } from "./catalog.js";

const slug = (name) =>
  String(name).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 28);

function tierFor(benchmark) {
  if (benchmark >= PROFILE_BENCHMARK.d1100) return "High";  // Dimensity 1100 / SD865 class+
  if (benchmark >= PROFILE_BENCHMARK.t618) return "Mid";    // Unisoc T618 class+
  return "Budget";
}

// Hard validation — anything that fails is rejected, never published.
export function validateDevice(rec) {
  const errors = [];
  const name = (rec.name || "").trim();
  if (name.length < 3 || name.length > 60 || !/[a-z]/i.test(name)) errors.push("bad name");
  if (!rec.brand) errors.push("missing brand");
  if (!rec.chip) errors.push("missing chip");
  if (!rec.screen) errors.push("missing screen");
  if (!(rec.msrp >= 20 && rec.msrp <= 1500)) errors.push(`msrp out of range (${rec.msrp})`);
  if (!(rec.street >= 10 && rec.street <= 1500)) errors.push(`street out of range (${rec.street})`);
  if (rec.street > rec.msrp * 1.6) errors.push("street implausibly above msrp");
  if (!["Budget", "Mid", "High"].includes(rec.tier)) errors.push("bad tier");
  if (!rec.profile) errors.push("no emulation profile resolved");
  const emuOk = rec.emu && SYSTEMS.every(s => [0, 1, 2].includes(rec.emu[s]));
  if (!emuOk) errors.push("incomplete emulation matrix");
  return { ok: errors.length === 0, errors };
}

export async function runDiscovery({ log = true } = {}) {
  const db = load();
  ensureSeeded(db);

  const candidates = await discoverCandidates();
  let added = 0, skipped = 0;
  const rejected = [];

  for (const c of candidates) {
    const id = slug(c.name);
    if (!id) { rejected.push({ name: c.name, errors: ["empty id"] }); continue; }
    if (getDevice(db, id)) { skipped++; continue; } // dedupe — already in catalog

    const specs = await scrapeSpecs(c.name);
    if (specs.error || !specs.chip) {
      rejected.push({ name: c.name, errors: ["spec scrape failed"] });
      continue;
    }

    // Rate the processor: known chips use their curated real benchmark; unknown
    // chips get one scraped live (nanoreview), then both map to an emulation tier.
    const known = KNOWN_CHIPS[specs.chip] != null;
    const benchmark = await resolveBenchmark(specs.chip);
    if (!known && benchmark == null) {
      // Can't rate an unseen chip without a benchmark — reject rather than guess.
      rejected.push({ name: c.name, errors: [`no benchmark for chip "${specs.chip}"`] });
      continue;
    }
    const { profile, emu } = resolveEmu(specs.chip, benchmark);

    const msrp = Math.round(Number(specs.msrp) || 0);
    const street = msrp ? Math.round(msrp * 0.95) : 0;

    const rec = {
      id,
      name: c.name.trim(),
      brand: specs.brand || c.name.split(" ")[0],
      chip: specs.chip,
      ram: specs.ram || null,
      screen: specs.screen || null,
      res: null,
      form: specs.form || null,
      os: specs.os || null,
      tier: tierFor(benchmark || 0),
      msrp,
      street,
      hr: null, // no HandheldRank index for fresh devices; scoring uses emulation alone
      tracked: false,
      emu,
      profile,
      source: "discovered",
    };

    const { ok, errors } = validateDevice(rec);
    if (!ok) { rejected.push({ name: c.name, errors }); continue; }

    // Learn the chip mapping so future devices with this SoC resolve instantly.
    if (!known) upsertChipProfile(db, specs.chip, profile, benchmark, "discovered");
    upsertDevice(db, rec);
    added++;
    if (log) console.log(`+ ${rec.name}  [${specs.chip} -> ${profile}, ${rec.tier}, $${msrp}]`);
  }

  if (log) {
    console.log(`\nDiscovery: ${candidates.length} found, ${added} added, ${skipped} already known, ${rejected.length} rejected.`);
    for (const r of rejected) console.log(`  ✗ ${r.name}: ${r.errors.join(", ")}`);
  }
  return { found: candidates.length, added, skipped, rejected };
}

// run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDiscovery().then(() => process.exit(0));
}
