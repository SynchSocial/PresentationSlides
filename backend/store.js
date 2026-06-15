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
  `);

  maybeSeed(_db);
  return _db;
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
