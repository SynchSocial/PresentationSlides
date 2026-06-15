# CLAUDE.md — deploy instructions for Claude Code

This is a two-part app: a Node/Express backend that scrapes retro-handheld prices via
Firecrawl and a Vite/React frontend that visualizes them. Get it running locally for the
user with the steps below.

## Prerequisites
- Node.js 18+ and npm (`node -v`).
- Optional: a Firecrawl API key from https://www.firecrawl.dev. Without one, the app runs in
  MOCK mode (deterministic, realistic fake prices) — fully functional for a demo.

## Setup (one command)
From the project root:
```bash
bash setup.sh
```
This installs root + backend + frontend deps, creates both `.env` files from templates, and
seeds 30 days of price history so the charts render immediately.

If `setup.sh` can't run (Windows without bash), do it manually:
```bash
npm install
cd backend  && npm install && copy .env.example .env   && cd ..
cd frontend && npm install && copy .env.example .env    && cd ..
cd backend  && node seedMock.js 30 && cd ..
```

## Add the Firecrawl key (optional but recommended)
Edit `backend/.env`:
```
FIRECRAWL_API_KEY=fc-xxxxxxxx
```
Leave it blank to stay in MOCK mode. You can confirm which mode is live via
`GET /api/health` → `{ "mock": true|false }`.

## Run
```bash
npm run dev
```
- Backend API: http://localhost:8787 (scrapes on boot if today is missing, then daily at 9am)
- Frontend:    http://localhost:5173

## Verify it works
```bash
curl -s localhost:8787/api/health
curl -s localhost:8787/api/devices | head -c 400
curl -s -X POST localhost:8787/api/refresh    # force a fresh price scrape
curl -s -X POST localhost:8787/api/discover   # find + auto-publish new handhelds
```
Then open http://localhost:5173, sort by "Best value", expand any device — you should see two
buy links, the averaged price, and a price-over-time chart.

## How it works (for context)
- `backend/devices.js` — seed catalog + scoring rubric: emulation profiles, chip→profile
  benchmarks (`PROFILE_BENCHMARK`/`KNOWN_CHIPS`), the 2-source resolver, and the
  `screenSpec()` resolution/aspect parser.
- `backend/catalog.js` — the live catalog (in the DB). Seeds itself from `devices.js` on
  first boot, then is the runtime source of devices.
- `backend/discover.js` — the self-building job: find new handhelds → scrape specs → rate the
  chip (known profile, or benchmark→nearest tier) → validate → auto-publish. `POST /api/discover`
  or weekly cron (`CRON_DISCOVER`).
- `backend/scrapeJob.js` — scrapes both sources, averages them (`(a+b)/2`), writes ONE data
  point per device per day into the SQLite DB (`backend/data/history.db`).
- `backend/firecrawl.js` — Firecrawl v2 `/scrape` JSON extraction (`price`, `buyUrl`,
  `inStock`); falls back to mock when no key.
- `backend/store.js` — SQLite persistence (`better-sqlite3`): `price_point`/`price_source`
  price history plus `device`/`chip_profile` catalog tables. Imports the shipped
  `data/history.json` snapshot once if the DB is empty on first boot.
- `backend/server.js` — REST API (`/api/devices`, `/api/history/:id`, `/api/refresh`,
  `/api/discover`, `/api/health`) + daily price cron + weekly discovery cron.
- `frontend/src/App.jsx` — reads the API, ranks by performance-per-dollar, shows the run/choke
  emulation matrix, dual buy links, and a recharts price chart.

## Common tweaks the user may ask for
- **Pin exact product URLs** (better extraction than store-search pages): add
  `sources: [{store:"Anbernic", url:"https://..."}, {store:"Amazon", url:"https://..."}]` to
  any device in `backend/devices.js`.
- **Change scrape time**: `CRON` in `backend/.env` (cron syntax).
- **More history**: `cd backend && node seedMock.js 90`.
- **Deploy**: backend on Render/Railway/Fly (set `FIRECRAWL_API_KEY`, persist `data/` on a
  volume); frontend on Vercel/Netlify (set `VITE_API_URL` to the deployed backend URL).

## Notes / gotchas
- npm needs symlinks for `node_modules/.bin`; some network drives don't support them. Install
  on a local disk.
- Ports 8787 / 5173 must be free (override with `PORT` for the API, `--port` for Vite).
- `backend/data/history.json` ships pre-seeded and is imported into `history.db` on first
  boot; the `.db` file is git-ignored and regenerated locally. Delete `history.db` to re-import
  the snapshot (or run `node seedMock.js 30` to rebuild a fresh trend).
