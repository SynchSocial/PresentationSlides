// catalog.js — the device catalog lives in the database now (not a code array).
// On first boot it seeds the `device` and `chip_profile` tables from the
// devices.js rubric; thereafter the DB is the source of truth and the discovery
// job grows it over time. devices.js stays as (a) the seed snapshot and (b) the
// fixed scoring rubric (profiles, benchmarks, screen/score helpers).

import {
  load, getDevices, deviceCount, upsertDevice, upsertChipProfile,
} from "./store.js";
import { DEVICES, KNOWN_CHIPS, CHIP_BENCHMARKS } from "./devices.js";

// Seed the catalog once, if empty.
export function ensureSeeded(conn = load()) {
  if (deviceCount(conn) > 0) return conn;

  const tx = conn.transaction(() => {
    for (const [chip, profile] of Object.entries(KNOWN_CHIPS)) {
      upsertChipProfile(conn, chip, profile, CHIP_BENCHMARKS[chip] ?? null, "seed");
    }
    for (const d of DEVICES) {
      upsertDevice(conn, {
        id: d.id, name: d.name, brand: d.brand, chip: d.chip, ram: d.ram,
        screen: d.screen, res: d.res ?? null, form: d.form, os: d.os,
        tier: d.tier, msrp: d.msrp, street: d.street, hr: d.hr ?? null,
        tracked: !!d.tracked, emu: d.emu,
        profile: KNOWN_CHIPS[d.chip] ?? null,
        source: "seed",
      });
    }
  });
  tx();
  return conn;
}

// The runtime catalog — array of device objects (same shape callers expect).
export function getCatalog(conn = load()) {
  ensureSeeded(conn);
  return getDevices(conn);
}
