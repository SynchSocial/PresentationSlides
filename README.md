# Retro Handheld Value Tracker

Tracks ~37 budget retro gaming handhelds by **performance-per-dollar**. A Firecrawl-backed
backend scrapes **two store sources per device once a day**, averages them
(`(sourceA + sourceB) / 2`), and stores one data point per day. The React frontend ranks
devices by value, shows which console systems each chip **runs vs chokes on**, gives **two
buy links per device**, and plots the **daily average price over time**.

```
handheld-tracker/
├── backend/
│   ├── server.js       Express API + daily cron
│   ├── scrapeJob.js    scrape both sources → average → store one daily point
│   ├── firecrawl.js    Firecrawl v2 /scrape client (price + buy URL); mock fallback
│   ├── devices.js      seed catalog + scoring rubric (profiles, chip benchmarks, helpers)
│   ├── catalog.js      DB-backed device catalog (seeds itself from devices.js once)
│   ├── discover.js     finds + specs + validates + auto-publishes new handhelds
│   ├── store.js        SQLite persistence (price history + device/chip-profile tables)
│   ├── seedMock.js     backfill N days so charts have a trend on day one
│   └── data/
│       ├── history.json   one-time price seed (imported into the DB on first boot)
│       └── history.db      SQLite database (generated, git-ignored)
└── frontend/
    └── HandheldValueTracker.jsx   reads the API; recharts price chart + buy links
```

## Run it

### Backend
```bash
cd backend
cp .env.example .env        # add FIRECRAWL_API_KEY (or leave blank for MOCK mode)
npm install
npm run seed 30             # optional: backfill 30 days of history for the charts
npm start                   # API on http://localhost:8787, scrapes daily at 9am
```
Without a key it runs in **MOCK mode** (deterministic fake prices) so you can see the whole
pipeline before wiring real scraping. Add a real `FIRECRAWL_API_KEY` from
https://www.firecrawl.dev and it scrapes live prices.

### Frontend
Drop `HandheldValueTracker.jsx` into a Vite/Next/CRA app:
```bash
npm install lucide-react recharts
# set VITE_API_URL=http://localhost:8787 (or your deployed API)
```

## API
| Method | Route | Returns |
|---|---|---|
| GET | `/api/devices` | every device with score, value, latest avg price, screen resolution + aspect, 2 buy links |
| GET | `/api/history/:id` | daily averaged price series for one device |
| POST | `/api/refresh` | trigger a price scrape immediately |
| POST | `/api/discover` | find + auto-publish newly released handhelds |
| GET | `/api/health` | `{ ok, mock }` |

## Self-building catalog
The catalog isn't a fixed list — it grows itself as new handhelds and processors
release. A weekly **discovery** sweep (`discover.js`, or `POST /api/discover`):
1. **Finds** newly released handhelds (Firecrawl web search).
2. **Specs** each one (chip, RAM, screen + resolution, form, MSRP).
3. **Rates the processor** — a known chip uses its hand-tuned emulation profile; a
   chip never seen before gets a scraped **benchmark** (≈ AnTuTu v10) mapped to the
   nearest tier in `PROFILE_BENCHMARK`, and that mapping is cached in `chip_profile`
   so the next device with that SoC resolves instantly.
4. **Validates hard** then **auto-publishes**. Survivors enter the ranking
   immediately (no "unverified" flag); the validation gate is the safety net —
   required fields, sane MSRP/price bounds, a plausible street-vs-MSRP ratio, a
   resolvable emulation profile, and dedupe. Anything that fails is rejected and
   logged, never published.

So a new device that undercuts the field on performance-per-dollar can break into
the top of the list the moment discovery finds it. Tune the schedule with
`CRON_DISCOVER` (default weekly, Mondays 10:00). Runs in MOCK mode too — discovery
uses a deterministic set of "just-released" candidates so the whole path is testable
without a key.

## How a price is built
Each device has two sources (a brand/primary store + Amazon, see `STORE`/`sourcesFor` in
`devices.js`). The daily job scrapes both via Firecrawl, extracting `{ price, buyUrl, inStock }`
with a JSON schema. The **average of whichever sources return a valid price** becomes that
day's data point (`avg`). The frontend plots `avg` as the solid line, with each source as a
faint dashed line. Prices are validated (`$15 ≤ price ≤ MSRP × 2.5`) before being stored.

To pin exact product URLs instead of store-search pages, add `sources: [{store,url},{store,url}]`
to any device in `devices.js`.

## Scoring
- **Emulation score** = sum over 16 systems (full=2, playable=1, chokes=0) ÷ 32 × 100.
- **Composite** = mean of [emulation score, HandheldRank index normalized to 100] where the
  index exists, else emulation score alone.
- **Value** = composite ÷ price × 10. Cheap devices win on value by design — read it next to
  the run/choke strip (a $50 unit still chokes on PS2).

## Deploy
- **Backend**: Render / Railway / Fly.io — set `FIRECRAWL_API_KEY`, persist `data/` on a volume
  (that's where `history.db` lives). The cron runs in-process; for serverless use a scheduled
  function hitting `/api/refresh`.
- **Frontend**: Vercel / Netlify — set `VITE_API_URL` to the deployed backend.

## Storage
Everything lives in a **SQLite** database (`backend/data/history.db`, via `better-sqlite3`):
- `price_point(device_id, date, avg)` + `price_source(device_id, date, store, price, buy_url, in_stock)`
  — daily price history, so each scrape upserts just the changed rows instead of rewriting a
  growing JSON blob.
- `device(...)` — the catalog itself (seeded once from `devices.js`, then grown by discovery).
- `chip_profile(chip, profile, benchmark)` — chip → emulation-profile mappings the system
  learns over time.

The DB is generated locally (git-ignored); on first boot it seeds the catalog from `devices.js`
and imports the shipped `data/history.json` price snapshot so the charts render immediately.

## Upgrade path
For years of history or multi-instance deploys, swap SQLite for Postgres (the `store.js` API —
`load/upsert/history/latest` — is the only thing that changes), and replace the cron with
Firecrawl's native **monitor** (scheduled scrape + change webhook) to get push alerts on price
drops instead of polling.

## Caveats
Store-search pages change layout and stock often; verify a few extractions after adding a key
and pin exact product URLs where you can. Prices are volatile (sales, tariffs). Emulation
ceilings are cross-source consensus, and HandheldRank is a single-author proprietary composite.
