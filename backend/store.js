// store.js — SQLite persistence of daily price history (better-sqlite3).
//
// One row per day per device, with each day's per-source quotes normalized into
// their own table (no more re-serializing a giant JSON array on every write):
//   price_point(device_id, date, avg)                        PK(device_id, date)
//   price_source(device_id, date, store, price, buy_url, …)   PK(device_id, date, store)
//
// The public API (load / save / upsert / history / latest / today) is kept
// identical to the previous JSON-file store, so server.js, scrapeJob.js and
// seedMock.js don't change. `load()` returns the live DB connection; `save()`
// is a no-op because writes are committed immediately.
//
// On first boot, if the DB is empty and the shipped data/history.json seed
// exists, it's imported once so the charts render immediately.

import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const DB_PATH = fileURLToPath(new URL("./data/history.db", import.meta.url));
const SEED_PATH = fileURLToPath(new URL("./data/history.json", import.meta.url));

let _db;

function connect() {
  if (_db) return _db;

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS price_point (
      device_id TEXT NOT NULL,
      date      TEXT NOT NULL,
      avg       INTEGER NOT NULL,
      PRIMARY KEY (device_id, date)
    );
    CREATE TABLE IF NOT EXISTS price_source (
      device_id TEXT NOT NULL,
      date      TEXT NOT NULL,
      store     TEXT NOT NULL,
      price     INTEGER,
      buy_url   TEXT,
      in_stock  INTEGER,
      PRIMARY KEY (device_id, date, store)
    );
    CREATE INDEX IF NOT EXISTS idx_point_device ON price_point(device_id, date);

    CREATE TABLE IF NOT EXISTS device (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      brand      TEXT,
      chip       TEXT,
      ram        TEXT,
      screen     TEXT,
      res        TEXT,
      form       TEXT,
      os         TEXT,
      tier       TEXT,
      msrp       INTEGER,
      street     INTEGER,
      hr         INTEGER,
      tracked    INTEGER DEFAULT 0,
      emu_json   TEXT NOT NULL,
      profile    TEXT,
      asin       TEXT,
      source     TEXT DEFAULT 'seed',
      created_at TEXT
    );
    -- chip -> emulation profile mappings the system learns over time
    CREATE TABLE IF NOT EXISTS chip_profile (
      chip      TEXT PRIMARY KEY,
      profile   TEXT NOT NULL,
      benchmark INTEGER,
      source    TEXT DEFAULT 'seed'
    );
  `);

  // Lightweight migration: add columns introduced after a DB was first created.
  const deviceCols = _db.prepare("PRAGMA table_info(device)").all().map(c => c.name);
  if (!deviceCols.includes("asin")) _db.exec("ALTER TABLE device ADD COLUMN asin TEXT");

  maybeSeed(_db);
  return _db;
}

// ── Device-catalog persistence ───────────────────────────────────────────────

const DEVICE_COLS = [
  "id","name","brand","chip","ram","screen","res","form","os","tier",
  "msrp","street","hr","tracked","emu_json","profile","asin","source","created_at",
];

function rowToDevice(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, brand: r.brand, chip: r.chip, ram: r.ram,
    screen: r.screen, res: r.res, form: r.form, os: r.os, tier: r.tier,
    msrp: r.msrp, street: r.street, hr: r.hr, tracked: !!r.tracked,
    emu: JSON.parse(r.emu_json), profile: r.profile, asin: r.asin,
    source: r.source, createdAt: r.created_at,
  };
}

export function getDevices(conn) {
  return conn.prepare("SELECT * FROM device").all().map(rowToDevice);
}

export function getDevice(conn, id) {
  return rowToDevice(conn.prepare("SELECT * FROM device WHERE id = ?").get(id));
}

export function deviceCount(conn) {
  return conn.prepare("SELECT COUNT(*) AS n FROM device").get().n;
}

// Insert/replace one catalog device. `rec.emu` is a 16-system object.
export function upsertDevice(conn, rec) {
  const row = {
    ...rec,
    tracked: rec.tracked ? 1 : 0,
    emu_json: JSON.stringify(rec.emu),
    created_at: rec.createdAt || new Date().toISOString(),
  };
  const placeholders = DEVICE_COLS.map(c => `@${c}`).join(", ");
  conn.prepare(
    `INSERT INTO device (${DEVICE_COLS.join(", ")}) VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${DEVICE_COLS.filter(c => c !== "id")
       .map(c => `${c} = excluded.${c}`).join(", ")}`
  ).run({
    id: row.id, name: row.name, brand: row.brand ?? null, chip: row.chip ?? null,
    ram: row.ram ?? null, screen: row.screen ?? null, res: row.res ?? null,
    form: row.form ?? null, os: row.os ?? null, tier: row.tier ?? null,
    msrp: row.msrp ?? null, street: row.street ?? null, hr: row.hr ?? null,
    tracked: row.tracked, emu_json: row.emu_json, profile: row.profile ?? null,
    asin: row.asin ?? null, source: row.source ?? "seed", created_at: row.created_at,
  });
  return conn;
}

// Cache a resolved Amazon ASIN on a device.
export function setDeviceAsin(conn, id, asin) {
  conn.prepare("UPDATE device SET asin = ? WHERE id = ?").run(asin ?? null, id);
  return conn;
}

export function getChipProfile(conn, chip) {
  return conn.prepare("SELECT * FROM chip_profile WHERE chip = ?").get(chip) || null;
}

export function upsertChipProfile(conn, chip, profile, benchmark, source = "seed") {
  conn.prepare(
    `INSERT INTO chip_profile (chip, profile, benchmark, source) VALUES (?, ?, ?, ?)
     ON CONFLICT(chip) DO UPDATE SET profile = excluded.profile,
       benchmark = excluded.benchmark, source = excluded.source`
  ).run(chip, profile, benchmark ?? null, source);
  return conn;
}

// Import the legacy JSON snapshot once, only if the DB has no data yet.
function maybeSeed(conn) {
  const count = conn.prepare("SELECT COUNT(*) AS n FROM price_point").get().n;
  if (count > 0 || !existsSync(SEED_PATH)) return;
  let json;
  try { json = JSON.parse(readFileSync(SEED_PATH, "utf8")); }
  catch { return; }
  const tx = conn.transaction(() => {
    for (const [deviceId, list] of Object.entries(json)) {
      for (const rec of list || []) writeRecord(conn, deviceId, rec);
    }
  });
  tx();
}

function writeRecord(conn, deviceId, record) {
  conn.prepare(
    `INSERT INTO price_point (device_id, date, avg) VALUES (?, ?, ?)
     ON CONFLICT(device_id, date) DO UPDATE SET avg = excluded.avg`
  ).run(deviceId, record.date, record.avg);

  conn.prepare("DELETE FROM price_source WHERE device_id = ? AND date = ?")
    .run(deviceId, record.date);

  const ins = conn.prepare(
    `INSERT INTO price_source (device_id, date, store, price, buy_url, in_stock)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const s of record.sources || []) {
    ins.run(
      deviceId, record.date, s.store,
      s.price ?? null,
      s.buyUrl ?? null,
      s.inStock == null ? null : (s.inStock ? 1 : 0)
    );
  }
}

function sourcesFor(conn, deviceId, date) {
  return conn.prepare(
    `SELECT store, price, buy_url AS buyUrl, in_stock AS inStock
     FROM price_source WHERE device_id = ? AND date = ? ORDER BY store`
  ).all(deviceId, date).map(s => ({
    store: s.store,
    price: s.price,
    buyUrl: s.buyUrl,
    inStock: s.inStock == null ? null : !!s.inStock,
  }));
}

// ── Public API (unchanged shape) ────────────────────────────────────────────

export function load() { return connect(); }

// Writes are committed immediately; kept for call-site compatibility.
export function save() {}

export const today = () => new Date().toISOString().slice(0, 10);

// Upsert one day's record for a device.
export function upsert(conn, deviceId, record) {
  conn.transaction(() => writeRecord(conn, deviceId, record))();
  return conn;
}

export function history(conn, deviceId) {
  const rows = conn.prepare(
    "SELECT date, avg FROM price_point WHERE device_id = ? ORDER BY date"
  ).all(deviceId);
  return rows.map(r => ({
    date: r.date,
    avg: r.avg,
    sources: sourcesFor(conn, deviceId, r.date),
  }));
}

export function latest(conn, deviceId) {
  const r = conn.prepare(
    "SELECT date, avg FROM price_point WHERE device_id = ? ORDER BY date DESC LIMIT 1"
  ).get(deviceId);
  if (!r) return null;
  return { date: r.date, avg: r.avg, sources: sourcesFor(conn, deviceId, r.date) };
}
